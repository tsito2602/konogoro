import { beforeEach, describe, expect, it, vi } from "vitest";
import { MULTIPART_PART_SIZE, MULTIPART_THRESHOLD } from "../shared/multipart";

const { api, put } = vi.hoisted(() => ({ api: vi.fn(), put: vi.fn() }));
vi.mock("./api", () => ({ api }));
vi.mock("./upload-transport", () => ({ putBlob: put }));

function videoBlob() {
  return {
    size: MULTIPART_THRESHOLD,
    type: "video/mp4",
    slice: (start: number, end: number, type: string) => ({ size: end - start, type }),
  } as Blob;
}

beforeEach(() => {
  vi.resetModules();
  api.mockReset();
  put.mockReset();
  let signed = 0;
  api.mockImplementation(async (path: string, init: RequestInit) => {
    const mediaId = path.split("/")[2];
    if (init.method === "DELETE") return { status: "aborted" };
    if (path.endsWith("/multipart"))
      return {
        sessionId: `session-${mediaId}`,
        partSize: MULTIPART_PART_SIZE,
        partCount: MULTIPART_THRESHOLD / MULTIPART_PART_SIZE,
        status: "pending",
      };
    if (path.includes("/parts/"))
      return {
        uploadUrl: `https://r2.test/${mediaId}/${path.split("/").at(-1)}/${++signed}`,
        byteSize: MULTIPART_PART_SIZE,
      };
    return { status: "completed" };
  });
  put.mockImplementation(async (_url: string, part: Blob, _type: string, progress: (bytes: number) => void) => {
    progress?.(part.size);
    return "a".repeat(32);
  });
});

describe("大容量動画の直接分割送信", () => {
  it("失敗したパートだけ新たなURLで再送し、同じ画面で成功済みパートを保持する", async () => {
    const { uploadMultipart } = await import("./multipart-upload");
    const blob = videoBlob();
    const attempts = new Map<number, string[]>();
    put.mockImplementation(async (url: string, part: Blob, _type: string, progress: (bytes: number) => void) => {
      const partNumber = Number(new URL(url).pathname.split("/")[2]);
      const urls = [...(attempts.get(partNumber) ?? []), url];
      attempts.set(partNumber, urls);
      progress(part.size / 2);
      if (partNumber === 2 && urls.length <= 3) throw new Error("disconnected");
      progress(part.size);
      return "a".repeat(32);
    });
    const progress: number[] = [];
    await expect(
      uploadMultipart("video", "original", blob, blob.type, (bytes) => progress.push(bytes)),
    ).rejects.toThrow("disconnected");
    const alreadySent = Array.from(attempts.entries()).filter(([number]) => number !== 2).length;
    const retryProgress: number[] = [];
    await uploadMultipart("video", "original", blob, blob.type, (bytes) => retryProgress.push(bytes));
    expect(attempts.get(2)).toHaveLength(4);
    expect(new Set(attempts.get(2)).size).toBe(4);
    for (const [partNumber, urls] of attempts) if (partNumber !== 2) expect(urls).toHaveLength(1);
    expect(retryProgress[0]).toBe(alreadySent * MULTIPART_PART_SIZE);
    expect(retryProgress.at(-1)).toBe(blob.size);
    expect([...progress, ...retryProgress].every((bytes) => bytes >= 0 && bytes <= blob.size)).toBe(true);
    const complete = api.mock.calls.filter(([path]) => path.endsWith("/complete"));
    const parts = JSON.parse(complete[0][1].body).parts;
    expect(parts.map((part: { partNumber: number }) => part.partNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parts.reduce((sum: number, part: { byteSize: number }) => sum + part.byteSize, 0)).toBe(blob.size);
  });

  it("複数の動画を同時に送信してもパート通信は全体で3件までに制限する", async () => {
    const { uploadMultipart } = await import("./multipart-upload");
    let active = 0;
    let maximum = 0;
    put.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return "a".repeat(32);
    });
    await Promise.all([
      uploadMultipart("one", "original", videoBlob(), "video/mp4"),
      uploadMultipart("two", "playback", videoBlob(), "video/mp4"),
    ]);
    expect(maximum).toBe(3);
    expect(put).toHaveBeenCalledTimes(16);
  });

  it("確定応答が失われた場合は確定だけ再試行し動画を再送しない", async () => {
    const { uploadMultipart } = await import("./multipart-upload");
    const normal = api.getMockImplementation()!;
    let completeAttempts = 0;
    api.mockImplementation(async (path: string, init: RequestInit) => {
      if (path.endsWith("/complete") && ++completeAttempts < 3) throw new Error("lost response");
      return normal(path, init);
    });
    await uploadMultipart("video", "original", videoBlob(), "video/mp4");
    expect(completeAttempts).toBe(3);
    expect(put).toHaveBeenCalledTimes(8);
  });

  it("中止シグナルで送信を止め、R2セッションを中止する", async () => {
    const { uploadMultipart } = await import("./multipart-upload");
    const controller = new AbortController();
    put.mockImplementation(
      async (_url: string, _part: Blob, _type: string, _progress: unknown, signal: AbortSignal) => {
        controller.abort(new DOMException("中止", "AbortError"));
        signal.throwIfAborted();
      },
    );
    await expect(
      uploadMultipart("video", "original", videoBlob(), "video/mp4", undefined, controller.signal),
    ).rejects.toThrow("中止");
    expect(api.mock.calls.some(([path, init]) => path.endsWith("/session-video") && init.method === "DELETE")).toBe(
      true,
    );
    expect(api.mock.calls.some(([path]) => path.endsWith("/complete"))).toBe(false);
    expect(put.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("小さいファイルは従来のPUT、大きい動画だけ分割送信を選ぶ", async () => {
    const { uploadFile } = await import("./media-upload");
    const small = new Blob(["small"], { type: "video/mp4" });
    await uploadFile("https://r2.test/small", small, small.type, undefined, { mediaId: "small" });
    expect(api).not.toHaveBeenCalled();
    expect(put.mock.calls[0][0]).toBe("https://r2.test/small");
    await uploadFile("https://r2.test/large", videoBlob(), "video/mp4", undefined, { mediaId: "large" });
    expect(api.mock.calls.some(([path]) => path === "/media/large/multipart")).toBe(true);
    expect(put.mock.calls.some(([url]) => url === "https://r2.test/large")).toBe(false);
  });

  it("開始APIの応答待ちでもすぐ中止でき、遅れて届いたセッションを破棄する", async () => {
    const { uploadMultipart, abortMultipartUpload } = await import("./multipart-upload");
    const normal = api.getMockImplementation()!;
    let finishStart!: (value: unknown) => void;
    api.mockImplementation((path: string, init: RequestInit) =>
      path.endsWith("/multipart")
        ? new Promise((resolve) => {
            finishStart = resolve;
          })
        : normal(path, init),
    );
    const controller = new AbortController();
    const upload = uploadMultipart("slow", "original", videoBlob(), "video/mp4", undefined, controller.signal);
    controller.abort(new DOMException("中止", "AbortError"));
    // This must settle before the server start response is released below.
    await expect(upload).rejects.toThrow("中止");
    expect(put).not.toHaveBeenCalled();
    finishStart({ sessionId: "late-session", partSize: MULTIPART_PART_SIZE, partCount: 8, status: "pending" });
    await abortMultipartUpload("slow");
    expect(api.mock.calls.some(([path, init]) => path.endsWith("/late-session") && init.method === "DELETE")).toBe(
      true,
    );
    expect(put).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { repairVideoThumbnail } from "./thumbnail-repair";
import { regenerateVideoThumbnail } from "./media-upload";
vi.mock("./media-upload", () => ({ regenerateVideoThumbnail: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
describe("サムネイルの再生成", () => {
  it("生成が成功してから画像だけを送信する", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    vi.mocked(regenerateVideoThumbnail).mockResolvedValue(blob);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ thumbnailUrl: "/new?v=2" })));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await repairVideoThumbnail("video", signal)).toBe("/new?v=2");
    expect(regenerateVideoThumbnail).toHaveBeenCalledWith("/api/media/video/thumbnail/source", signal);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/media/video/thumbnail/image",
      expect.objectContaining({ method: "PUT", body: blob, headers: { "Content-Type": "image/png" } }),
    );
  });
  it("生成失敗時には何も送信しない", async () => {
    vi.mocked(regenerateVideoThumbnail).mockRejectedValue(new Error("decode failed"));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(repairVideoThumbnail("video", new AbortController().signal)).rejects.toThrow("decode failed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("生成後に中断しても送信しない", async () => {
    const controller = new AbortController();
    vi.mocked(regenerateVideoThumbnail).mockImplementation(async () => {
      controller.abort();
      return new Blob();
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(repairVideoThumbnail("video", controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("保存失敗は成功として扱わない", async () => {
    vi.mocked(regenerateVideoThumbnail).mockResolvedValue(new Blob());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "保存失敗" }), { status: 500 })),
    );
    await expect(repairVideoThumbnail("video", new AbortController().signal)).rejects.toThrow("保存失敗");
  });
});

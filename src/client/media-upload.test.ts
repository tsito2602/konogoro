import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareMediaFiles, validateMediaFiles, type SelectedMediaFile } from "./media-upload";

describe("validateMediaFiles", () => {
  it("対象ファイル名と非対応理由を返す", () => {
    expect(validateMediaFiles([new File([], "empty.mp4", { type: "video/mp4" })], 0)).toBe(
      "empty.mp4: ファイルの容量が0バイトです。",
    );
    expect(validateMediaFiles([new File(["data"], "clip.avi", { type: "video/x-msvideo" })], 0)).toContain(
      "clip.avi: 対応していない形式です。",
    );
  });

  it("上限超過時に現在数と追加数を返す", () => {
    expect(validateMediaFiles([new File(["data"], "photo.jpg", { type: "image/jpeg" })], 30)).toBe(
      "選べる写真・動画は合計30件までです（現在30件、追加1件）。",
    );
  });
});

describe("prepareMediaFiles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    "opaque",
    "unknown-duration",
    "transparent",
    "no-context",
    "zero-width",
    "seek-error",
    "decode-error",
    "encode-error",
  ])("動画を1件ずつシーク後に準備し、不正フレームを拒否する: %s", async (mode) => {
    let activeEncodes = 0;
    let maxActiveEncodes = 0;
    let objectUrlIndex = 0;
    const videos: Array<{ preload: string; load: ReturnType<typeof vi.fn> }> = [];
    let seekCount = 0;

    vi.stubGlobal("window", { setTimeout });
    vi.stubGlobal("URL", {
      createObjectURL: () => `blob:thumbnail-${objectUrlIndex++}`,
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        if (tagName === "video") {
          const listeners = new Map<string, EventListener>();
          const video = {
            preload: "",
            muted: false,
            playsInline: false,
            videoWidth: mode === "zero-width" ? 0 : 1920,
            readyState: 2,
            videoHeight: 1080,
            duration: mode === "unknown-duration" ? Infinity : 8,
            addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
            removeEventListener: (type: string) => listeners.delete(type),
            removeAttribute: vi.fn(),
            load: vi.fn(),
            set src(_value: string) {
              setTimeout(
                () => listeners.get(mode === "decode-error" ? "error" : "loadeddata")?.(new Event("loadeddata")),
                0,
              );
            },
            set currentTime(value: number) {
              expect(value).toBeGreaterThan(0);
              expect(value).toBeLessThan(8);
              seekCount += 1;
              if (mode === "seek-error") throw new Error("seek failed");
              setTimeout(() => listeners.get("seeked")?.(new Event("seeked")), 0);
            },
          };
          videos.push(video);
          return video;
        }
        return {
          width: 0,
          height: 0,
          getContext: () =>
            mode === "no-context"
              ? null
              : {
                  drawImage: () => expect(seekCount).toBeGreaterThan(0),
                  getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, mode === "transparent" ? 0 : 255]) }),
                },
          toBlob: (callback: BlobCallback, type: string) => {
            activeEncodes += 1;
            maxActiveEncodes = Math.max(maxActiveEncodes, activeEncodes);
            setTimeout(() => {
              activeEncodes -= 1;
              callback(mode === "encode-error" ? null : new Blob(["thumbnail"], { type }));
            }, 10);
          },
        };
      },
    });

    const files = [createVideo("one"), createVideo("two"), createVideo("three")];
    const prepared: SelectedMediaFile[] = [];
    await prepareMediaFiles(files, (file) => prepared.push(file));

    expect(prepared).toHaveLength(3);
    expect(
      prepared.every(
        (file) => file.status === (mode === "opaque" || mode === "unknown-duration" ? "ready" : "preparation-failed"),
      ),
    ).toBe(true);
    expect(
      prepared.every((file) => Boolean(file.thumbnail) === (mode === "opaque" || mode === "unknown-duration")),
    ).toBe(true);
    expect(videos.every((video) => video.load.mock.calls.length === 2)).toBe(true);
    expect(maxActiveEncodes).toBe(mode === "opaque" || mode === "unknown-duration" || mode === "encode-error" ? 1 : 0);
    expect(videos.every((video) => video.preload === "auto")).toBe(true);
  });
});

function createVideo(id: string): SelectedMediaFile {
  return {
    id,
    file: { type: "video/mp4", lastModified: Date.now() } as File,
    previewUrl: `blob:${id}`,
    thumbnail: null,
    capturedAt: null,
    width: null,
    height: null,
    durationSeconds: null,
    status: "preparing",
  };
}

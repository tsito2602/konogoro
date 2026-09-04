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

  it("動画をシークせず1件ずつ準備する", async () => {
    let activeEncodes = 0;
    let maxActiveEncodes = 0;
    let objectUrlIndex = 0;
    const videos: Array<{ preload: string }> = [];

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
            videoWidth: 1920,
            videoHeight: 1080,
            duration: 8,
            addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
            removeAttribute: vi.fn(),
            load: vi.fn(),
            set src(_value: string) {
              setTimeout(() => listeners.get("loadeddata")?.(new Event("loadeddata")), 0);
            },
            set currentTime(_value: number) {
              throw new Error("動画をシークしてはいけません");
            },
          };
          videos.push(video);
          return video;
        }
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: vi.fn() }),
          toBlob: (callback: BlobCallback, type: string) => {
            activeEncodes += 1;
            maxActiveEncodes = Math.max(maxActiveEncodes, activeEncodes);
            setTimeout(() => {
              activeEncodes -= 1;
              callback(new Blob(["thumbnail"], { type }));
            }, 10);
          },
        };
      },
    });

    const files = [createVideo("one"), createVideo("two"), createVideo("three")];
    const prepared: SelectedMediaFile[] = [];
    await prepareMediaFiles(files, (file) => prepared.push(file));

    expect(prepared).toHaveLength(3);
    expect(prepared.every((file) => file.status === "ready")).toBe(true);
    expect(maxActiveEncodes).toBe(1);
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

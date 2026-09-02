import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareMediaFiles, type SelectedMediaFile } from "./media-upload";

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

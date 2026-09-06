import { afterEach, describe, expect, it, vi } from "vitest";
import * as mediaUpload from "./media-upload";
import { uploadPreparedPlayback, type PreparedPlayback } from "./video-playback";

const playback: PreparedPlayback = {
  file: new File(["video"], "prepared.mp4", { type: "video/mp4" }),
  entry: {
    original: { filename: "original.mov", byteSize: 1000, sha256: "a".repeat(64) },
    playback: {
      filename: "prepared.mp4",
      byteSize: 5,
      sha256: "b".repeat(64),
      mimeType: "video/mp4",
      videoCodec: "h264",
      audioCodec: null,
      width: 640,
      height: 360,
      durationSeconds: 1,
      faststart: true,
    },
  },
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("再生用動画の送信と確定", () => {
  it("送信完了後だけ確定し、multipart対象と同じ中断信号を渡す", async () => {
    const events: string[] = [];
    const upload = vi.spyOn(mediaUpload, "uploadFile").mockImplementation(async () => {
      events.push("PUT");
    });
    const fetch = vi.fn(async (path: string) => {
      events.push(path);
      return Response.json(
        path.endsWith("upload-url") ? { ready: false, uploadUrl: "https://r2.example/video" } : { ready: true },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const progress = vi.fn();
    const signal = new AbortController().signal;
    await uploadPreparedPlayback("video", playback, progress, signal);
    expect(events).toEqual(["/api/media/video/playback/upload-url", "PUT", "/api/media/video/playback/complete"]);
    expect(upload).toHaveBeenCalledWith("https://r2.example/video", playback.file, "video/mp4", progress, {
      mediaId: "video",
      variant: "playback",
      signal,
    });
    expect(progress).toHaveBeenLastCalledWith(5);
  });

  it("確定応答を失ったあとの再試行では送信済みの再生用動画を上書きしない", async () => {
    const upload = vi.spyOn(mediaUpload, "uploadFile");
    const fetch = vi.fn(async () => Response.json({ ready: true }));
    vi.stubGlobal("fetch", fetch);
    await uploadPreparedPlayback("video", playback, vi.fn());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it("送信中断・失敗した再生用動画は確定しない", async () => {
    vi.spyOn(mediaUpload, "uploadFile").mockRejectedValue(new Error("中断"));
    const fetch = vi.fn(async () => Response.json({ ready: false, uploadUrl: "https://r2.example/video" }));
    vi.stubGlobal("fetch", fetch);
    await expect(uploadPreparedPlayback("video", playback, vi.fn())).rejects.toThrow("中断");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

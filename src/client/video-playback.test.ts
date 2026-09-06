import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fileSha256 } from "./file-sha256";
import { matchPreparedVideos } from "./video-playback";
import { createPendingMediaFile } from "./media-upload";

const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("動画の対応確認", () => {
  it.each([0, 1, 55, 56, 63, 64, 65, 127, 128, 1024 * 1024, 2 * 1024 * 1024 + 111])(
    "%iバイトを1MiB以下の分割でNodeのSHA-256と同じ結果にする",
    async (size) => {
      const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
      expect(await fileSha256(new Blob([bytes]))).toBe(digest(bytes));
    },
  );

  const fixture = () => {
    const source = new File(["source"], "旅行.mp4", { type: "video/mp4" });
    const playback = new File(["small"], "1-small.playback.mp4", { type: "video/mp4" });
    const entry = {
      original: { filename: source.name, byteSize: source.size, sha256: digest("source") },
      playback: {
        filename: playback.name,
        byteSize: playback.size,
        sha256: digest("small"),
        mimeType: "video/mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1920,
        height: 1080,
        durationSeconds: 5,
        faststart: true,
      },
    };
    const manifest = (entries = [entry]) => new File([JSON.stringify({ version: 1, entries })], "konogoro-videos.json");
    return { source, playback, entry, manifest };
  };

  it("同名・同容量の別動画をハッシュで区別し、元動画を差し替えずに紐付ける", async () => {
    const { source, playback, manifest } = fixture();
    const correct = createPendingMediaFile(source);
    const wrong = createPendingMediaFile(new File(["wrong!"], source.name, { type: source.type }));
    const result = await matchPreparedVideos([manifest(), playback], [wrong, correct], fileSha256);
    expect([...result.keys()]).toEqual([correct.id]);
    expect(correct.file).toBe(source);
    expect(result.get(correct.id)?.file).toBe(playback);
  });

  it("再生用動画の破損、欠落、二重指定と未対応の元動画を拒否する", async () => {
    const { source, playback, entry, manifest } = fixture();
    const originals = [createPendingMediaFile(source)];
    await expect(matchPreparedVideos([manifest()], originals, fileSha256)).rejects.toThrow("不足");
    await expect(
      matchPreparedVideos([manifest(), new File(["wrong"], playback.name)], originals, fileSha256),
    ).rejects.toThrow("一致しません");
    await expect(matchPreparedVideos([manifest(), playback], [], fileSha256)).rejects.toThrow("先に追加");
    await expect(matchPreparedVideos([manifest([entry, entry]), playback], originals, fileSha256)).rejects.toThrow(
      "重複",
    );
    await expect(
      matchPreparedVideos(
        [manifest([{ ...entry, playback: { ...entry.playback, height: 1920 } }]), playback],
        originals,
        fileSha256,
      ),
    ).rejects.toThrow("情報が正しくありません");
  });
});

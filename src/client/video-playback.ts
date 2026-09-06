import type { PlaybackEntry } from "../shared/video-playback";
import type { SelectedMediaFile } from "./media-upload";
import { api } from "./api";
import { uploadFile } from "./media-upload";

export type PreparedPlayback = { file: File; entry: PlaybackEntry };

export async function matchPreparedVideos(
  chosen: File[],
  originals: SelectedMediaFile[],
  hash: (file: Blob) => Promise<string>,
): Promise<Map<string, PreparedPlayback>> {
  const manifests = chosen.filter((file) => file.name === "konogoro-videos.json");
  if (manifests.length !== 1 || manifests[0].size > 128 * 1024)
    throw new Error("出力フォルダ内のkonogoro-videos.jsonと再生用動画を選択してください。");
  const { playbackManifestSchema } = await import("../shared/video-playback");
  let value: unknown;
  try {
    value = JSON.parse(await manifests[0].text());
  } catch {
    throw new Error("取り込み用の情報を読み込めません。動画を準備し直してください。");
  }
  const parsed = playbackManifestSchema.safeParse(value);
  if (!parsed.success) throw new Error("取り込み用の情報が正しくありません。動画を準備し直してください。");
  const matches = new Map<string, PreparedPlayback>();
  const checked = new Map<File, string>();
  const digest = async (file: File) => {
    if (!checked.has(file)) checked.set(file, await hash(file));
    return checked.get(file)!;
  };
  for (const entry of parsed.data.entries) {
    const candidates = originals.filter(
      (item) =>
        item.file.type.startsWith("video/") &&
        !item.mediaId &&
        item.file.name === entry.original.filename &&
        item.file.size === entry.original.byteSize,
    );
    if (candidates.length === 0) throw new Error(`${entry.original.filename}: 対応する元動画を先に追加してください。`);
    const verified = [];
    for (const item of candidates) if ((await digest(item.file)) === entry.original.sha256) verified.push(item);
    if (verified.length !== 1)
      throw new Error(`${entry.original.filename}: 元動画が一致しないか、同じ動画が重複しています。`);
    const item = verified[0];
    if (matches.has(item.id)) throw new Error(`${entry.original.filename}: 再生用動画が重複しています。`);
    const playbackFiles = chosen.filter(
      (file) => file.name === entry.playback.filename && file.size === entry.playback.byteSize,
    );
    if (playbackFiles.length !== 1 || (await digest(playbackFiles[0])) !== entry.playback.sha256)
      throw new Error(`${entry.playback.filename}: 再生用動画が不足しているか、内容が一致しません。`);
    matches.set(item.id, { file: playbackFiles[0], entry });
  }
  return matches;
}

export async function uploadPreparedPlayback(
  mediaId: string,
  playback: PreparedPlayback,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
) {
  const body = JSON.stringify(playback.entry);
  const request = <T>(path: string) =>
    api<T>(path, {
      method: "POST",
      body,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
    });
  const target = await request<{ ready: boolean; uploadUrl?: string }>(`/media/${mediaId}/playback/upload-url`);
  if (!target.ready) {
    if (!target.uploadUrl) throw new Error("再生用動画の送信先を取得できません。");
    await uploadFile(target.uploadUrl, playback.file, "video/mp4", onProgress, {
      mediaId,
      variant: "playback",
      signal,
    });
    await request(`/media/${mediaId}/playback/complete`);
  }
  onProgress(playback.file.size);
}

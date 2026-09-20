import { api } from "./api";
import { regenerateVideoThumbnail } from "./media-upload";

export async function repairVideoThumbnail(mediaId: string, signal: AbortSignal): Promise<string> {
  const id = encodeURIComponent(mediaId);
  const image = await regenerateVideoThumbnail(`/api/media/${id}/thumbnail/source`, signal);
  signal.throwIfAborted();
  const result = await api<{ thumbnailUrl: string }>(`/media/${id}/thumbnail/image`, {
    method: "PUT",
    body: image,
    headers: { "Content-Type": "image/png" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
  });
  return result.thumbnailUrl;
}

import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ulid } from "ulid";
import { canCreatePost } from "../shared/permissions";
import { thumbnailUrl } from "../shared/media-thumbnail";
import type { User } from "../shared/types";
import { serveStoredMedia } from "./media-delivery";

type ThumbnailEnv = { Bindings: Cloudflare.Env; Variables: { currentUser: User } };
type VideoRow = {
  original_object_key: string;
  thumbnail_object_key: string | null;
  playback_object_key: string | null;
  playback_status: string | null;
  mime_type: string;
};
const eligible = `status = 'uploaded' AND kind = 'video'
  AND post_id IN (SELECT id FROM posts WHERE status = 'published')`;

async function findVideo(db: D1Database, id: string) {
  return db
    .prepare(
      `SELECT original_object_key, thumbnail_object_key, playback_object_key,
    playback_status, mime_type FROM media WHERE id = ? AND ${eligible}`,
    )
    .bind(id)
    .first<VideoRow>();
}

export const mediaThumbnailRoutes = new Hono<ThumbnailEnv>();
mediaThumbnailRoutes.use("/media/:mediaId/thumbnail/*", async (c, next) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿を編集する権限がありません" }, 403);
  await next();
});

// Same-origin, range-capable source avoids cross-origin canvas restrictions and full-video downloads.
mediaThumbnailRoutes.get("/media/:mediaId/thumbnail/source", async (c) => {
  const media = await findVideo(c.env.DB, c.req.param("mediaId"));
  if (!media) return c.json({ error: "動画が見つかりません" }, 404);
  const playback = media.playback_status === "ready" && media.playback_object_key;
  const response = await serveStoredMedia(c.req.raw, c.env.MEDIA, playback || media.original_object_key, {
    contentType: playback ? "video/mp4" : media.mime_type,
  });
  if (!response) return c.json({ error: "動画ファイルが見つかりません" }, 404);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});

mediaThumbnailRoutes.put(
  "/media/:mediaId/thumbnail/image",
  bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: "画像が大きすぎます" }, 413) }),
  async (c) => {
    const id = c.req.param("mediaId");
    const media = await findVideo(c.env.DB, id);
    if (!media) return c.json({ error: "動画が見つかりません" }, 404);
    if (c.req.header("Content-Type") !== "image/png") return c.json({ error: "PNG画像を指定してください" }, 400);
    const bytes = await c.req.arrayBuffer();
    const data = new Uint8Array(bytes);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
    const view = new DataView(bytes);
    if (
      bytes.byteLength < 33 ||
      signature.some((value, i) => data[i] !== value) ||
      view.getUint32(16) < 1 ||
      view.getUint32(16) > 480 ||
      view.getUint32(20) < 1 ||
      view.getUint32(20) > 480
    )
      return c.json({ error: "サムネイル画像が不正です" }, 400);
    const key = `media/${id}/thumbnail/regenerated-${ulid()}.png`;
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
    // Commit only if the video still exists and another regeneration has not won the race.
    // Keep the previous image for recovery; never overwrite or delete the original video.
    const result = await c.env.DB.prepare(
      `UPDATE media SET thumbnail_object_key = ?
      WHERE id = ? AND thumbnail_object_key IS ? AND ${eligible}`,
    )
      .bind(key, id, media.thumbnail_object_key)
      .run();
    if (!result.meta.changes) {
      await c.env.MEDIA.delete(key);
      return c.json({ error: "動画が更新されました。画面を開き直してください" }, 409);
    }
    return c.json({ thumbnailUrl: thumbnailUrl(id, key) });
  },
);

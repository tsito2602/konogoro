import { Hono } from "hono";
import { canCreatePost } from "../shared/permissions";
import { playbackEntrySchema } from "../shared/video-playback";
import type { User } from "../shared/types";
import { createPresignedUploadUrl, hasUploadCredentials } from "./r2";

type PlaybackEnv = { Bindings: Cloudflare.Env & R2Secrets; Variables: { currentUser: User } };
type PlaybackRow = {
  original_object_key: string;
  original_filename: string;
  original_sha256: string | null;
  byte_size: number;
  kind: string;
  playback_object_key: string | null;
  playback_sha256: string | null;
  playback_byte_size: number | null;
  playback_status: string | null;
};

async function ownedMedia(db: D1Database, mediaId: string, userId: string) {
  return db
    .prepare(
      `SELECT m.original_object_key, m.original_filename, m.original_sha256, m.byte_size, m.kind,
    m.playback_object_key, m.playback_sha256, m.playback_byte_size, m.playback_status
    FROM media m JOIN posts p ON p.id = m.post_id
    WHERE m.id = ? AND m.created_by = ? AND p.status IN ('draft', 'published')`,
    )
    .bind(mediaId, userId)
    .first<PlaybackRow>();
}

function matchesOriginal(row: PlaybackRow, input: ReturnType<typeof playbackEntrySchema.parse>) {
  return (
    row.kind === "video" &&
    row.original_filename === input.original.filename &&
    row.byte_size === input.original.byteSize &&
    row.original_sha256 === input.original.sha256
  );
}

export const videoPlaybackRoutes = new Hono<PlaybackEnv>();

videoPlaybackRoutes.post("/media/:mediaId/playback/upload-url", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const input = playbackEntrySchema.parse(await c.req.json());
  const mediaId = c.req.param("mediaId");
  const media = await ownedMedia(c.env.DB, mediaId, c.var.currentUser.id);
  if (!media) return c.json({ error: "メディアが見つかりません" }, 404);
  if (!matchesOriginal(media, input)) return c.json({ error: "再生用動画に対応する元動画を確認できません" }, 409);
  if (
    media.playback_sha256 &&
    (media.playback_sha256 !== input.playback.sha256 || media.playback_byte_size !== input.playback.byteSize)
  ) {
    return c.json({ error: "別の再生用動画の送信がすでに開始されています" }, 409);
  }
  if (media.playback_status === "ready") return c.json({ ready: true });
  if (!hasUploadCredentials(c.env)) return c.json({ error: "動画を送信するための設定が必要です" }, 503);
  const key = `media/${mediaId}/playback/${input.playback.sha256}.mp4`;
  const result = await c.env.DB.prepare(
    `UPDATE media SET playback_object_key = ?, playback_status = 'pending',
    playback_byte_size = ?, playback_sha256 = ?
    WHERE id = ? AND created_by = ? AND original_sha256 = ? AND playback_status IS NOT 'ready'
      AND (playback_sha256 IS NULL OR (playback_sha256 = ? AND playback_byte_size = ?))`,
  )
    .bind(
      key,
      input.playback.byteSize,
      input.playback.sha256,
      mediaId,
      c.var.currentUser.id,
      input.original.sha256,
      input.playback.sha256,
      input.playback.byteSize,
    )
    .run();
  if (!result.meta.changes) return c.json({ error: "動画の状態が変わりました。もう一度お試しください" }, 409);
  return c.json({ ready: false, uploadUrl: await createPresignedUploadUrl(c.env, key, "video/mp4") });
});

videoPlaybackRoutes.post("/media/:mediaId/playback/complete", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const input = playbackEntrySchema.parse(await c.req.json());
  const mediaId = c.req.param("mediaId");
  const media = await ownedMedia(c.env.DB, mediaId, c.var.currentUser.id);
  if (!media) return c.json({ error: "メディアが見つかりません" }, 404);
  if (
    !matchesOriginal(media, input) ||
    !media.playback_object_key ||
    media.playback_sha256 !== input.playback.sha256 ||
    media.playback_byte_size !== input.playback.byteSize
  ) {
    return c.json({ error: "送信中の再生用動画を確認できません" }, 409);
  }
  if (media.playback_status === "ready") return c.json({ ready: true });
  const [original, playback] = await Promise.all([
    c.env.MEDIA.head(media.original_object_key),
    c.env.MEDIA.head(media.playback_object_key),
  ]);
  if (
    !original ||
    original.size !== media.byte_size ||
    !playback ||
    playback.size !== media.playback_byte_size ||
    playback.httpMetadata?.contentType !== "video/mp4"
  ) {
    return c.json({ error: "送信が完了していません。再試行してください" }, 409);
  }
  const result = await c.env.DB.prepare(
    `UPDATE media SET playback_status = 'ready'
    WHERE id = ? AND created_by = ? AND original_sha256 = ? AND playback_sha256 = ? AND playback_status = 'pending'`,
  )
    .bind(mediaId, c.var.currentUser.id, input.original.sha256, input.playback.sha256)
    .run();
  if (!result.meta.changes) return c.json({ error: "動画の状態が変わりました。もう一度お試しください" }, 409);
  return c.json({ ready: true });
});

import { Hono, type Context } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { canCreatePost } from "../shared/permissions";
import {
  MAX_VIDEO_BYTES,
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
  multipartPartBytes,
  type MultipartSession,
} from "../shared/multipart";
import type { User } from "../shared/types";
import { createPresignedPartUrl, hasUploadCredentials } from "./r2";

type MultipartEnv = { Bindings: Cloudflare.Env & R2Secrets; Variables: { currentUser: User } };
type SessionRow = {
  id: string;
  media_id: string;
  variant: "original" | "playback";
  object_key: string;
  byte_size: number;
  content_type: string;
  upload_id: string;
  status: "pending" | "completed" | "aborted";
  created_at: string;
  writable?: number;
};
const startSchema = z
  .object({
    variant: z.enum(["original", "playback"]),
    byteSize: z.number().int().min(MULTIPART_THRESHOLD).max(MAX_VIDEO_BYTES),
  })
  .strict();
const completeSchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            partNumber: z
              .number()
              .int()
              .min(1)
              .max(Math.ceil(MAX_VIDEO_BYTES / MULTIPART_PART_SIZE)),
            etag: z.string().regex(/^[a-fA-F0-9]{32}$/),
            byteSize: z.number().int().positive().max(MULTIPART_PART_SIZE),
          })
          .strict(),
      )
      .min(1)
      .max(Math.ceil(MAX_VIDEO_BYTES / MULTIPART_PART_SIZE)),
  })
  .strict();

export const multipartRoutes = new Hono<MultipartEnv>();

multipartRoutes.use("/media/:mediaId/multipart*", async (c, next) => {
  if (!c.var.currentUser) return c.json({ error: "ログインが必要です" }, 401);
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  await next();
});

multipartRoutes.post("/media/:mediaId/multipart", async (c) => {
  const input = startSchema.parse(await c.req.json());
  // Query only server-owned metadata: the client never chooses an R2 key or upload ID.
  const columns =
    input.variant === "original"
      ? "m.original_object_key AS object_key, m.byte_size, m.mime_type AS content_type, m.status AS upload_status"
      : "m.playback_object_key AS object_key, m.playback_byte_size AS byte_size, 'video/mp4' AS content_type, m.playback_status AS upload_status";
  const media = await c.env.DB.prepare(
    `
    SELECT ${columns} FROM media m JOIN posts p ON p.id = m.post_id
     WHERE m.id = ? AND m.created_by = ? AND m.kind = 'video'
       AND p.status IN ('draft', 'published') AND (p.status = 'published' OR p.created_by = ?)
  `,
  )
    .bind(c.req.param("mediaId"), c.var.currentUser.id, c.var.currentUser.id)
    .first<{ object_key: string | null; byte_size: number; content_type: string; upload_status: string }>();
  if (!media) return c.json({ error: "アップロードする動画が見つかりません" }, 404);
  if (!media.object_key || media.byte_size !== input.byteSize)
    return c.json({ error: "動画の容量が登録内容と一致しません" }, 409);
  if (!hasUploadCredentials(c.env)) return c.json({ error: "R2アップロード用secretが設定されていません" }, 503);

  let previous = await c.env.DB.prepare("SELECT * FROM multipart_uploads WHERE media_id = ? AND variant = ?")
    .bind(c.req.param("mediaId"), input.variant)
    .first<SessionRow>();
  if (previous && (previous.object_key !== media.object_key || previous.byte_size !== input.byteSize))
    return c.json({ error: "送信中の動画が登録内容と一致しません" }, 409);
  if (previous && previous.status === "pending" && Date.now() - Date.parse(previous.created_at) > 6 * 86400_000) {
    if (await completedObject(c, previous)) {
      await markCompleted(c, previous);
      return c.json(sessionResponse({ ...previous, status: "completed" }));
    }
    await abortSession(c, previous);
    previous = { ...previous, status: "aborted" };
  }
  if (previous?.status === "completed") return c.json(sessionResponse(previous));
  if (!["pending", "failed"].includes(media.upload_status))
    return c.json({ error: "この動画はすでにアップロード済みです" }, 409);
  if (previous?.status === "pending") return c.json(sessionResponse(previous));
  if (previous)
    await c.env.DB.prepare("DELETE FROM multipart_uploads WHERE id = ? AND status = 'aborted'").bind(previous.id).run();

  const sessionId = ulid();
  const upload = await c.env.MEDIA.createMultipartUpload(media.object_key, {
    httpMetadata: { contentType: media.content_type },
    customMetadata: { "multipart-session": sessionId },
  });
  const session: SessionRow = {
    id: sessionId,
    media_id: c.req.param("mediaId"),
    variant: input.variant,
    object_key: media.object_key,
    byte_size: input.byteSize,
    content_type: media.content_type,
    upload_id: upload.uploadId,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  try {
    const inserted = await c.env.DB.prepare(
      `
      INSERT INTO multipart_uploads (id, media_id, variant, object_key, byte_size, content_type, upload_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(media_id, variant) DO NOTHING
    `,
    )
      .bind(
        session.id,
        session.media_id,
        session.variant,
        session.object_key,
        session.byte_size,
        session.content_type,
        session.upload_id,
        session.created_at,
      )
      .run();
    if (!inserted.meta.changes) {
      await upload.abort();
      const concurrent = await c.env.DB.prepare("SELECT * FROM multipart_uploads WHERE media_id = ? AND variant = ?")
        .bind(session.media_id, session.variant)
        .first<SessionRow>();
      if (!concurrent || concurrent.status === "aborted") return c.json({ error: "開始を再試行してください" }, 409);
      return c.json(sessionResponse(concurrent));
    }
  } catch (error) {
    await upload.abort().catch(() => undefined);
    throw error;
  }
  return c.json(sessionResponse(session), 201);
});

multipartRoutes.post("/media/:mediaId/multipart/:sessionId/parts/:partNumber", async (c) => {
  const session = await ownedSession(c);
  if (!session) return c.json({ error: "送信情報が見つかりません" }, 404);
  if (session.status !== "pending" || !session.writable) return c.json({ error: "この送信は終了しています" }, 409);
  const partNumber = Number(c.req.param("partNumber"));
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount(session))
    return c.json({ error: "送信する部分が正しくありません" }, 400);
  if (!hasUploadCredentials(c.env)) return c.json({ error: "R2アップロード用secretが設定されていません" }, 503);
  const byteSize = multipartPartBytes(session.byte_size, partNumber);
  const uploadUrl = await createPresignedPartUrl(
    c.env,
    session.object_key,
    session.upload_id,
    partNumber,
    session.content_type,
    byteSize,
  );
  return c.json({ uploadUrl, byteSize });
});

multipartRoutes.post("/media/:mediaId/multipart/:sessionId/complete", async (c) => {
  const input = completeSchema.parse(await c.req.json());
  const session = await ownedSession(c);
  if (!session) return c.json({ error: "送信情報が見つかりません" }, 404);
  if (session.status === "aborted") return c.json({ error: "この送信は中止されています" }, 409);
  const parts = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
  if (
    parts.length !== partCount(session) ||
    parts.some(
      (part, index) =>
        part.partNumber !== index + 1 || part.byteSize !== multipartPartBytes(session.byte_size, part.partNumber),
    )
  )
    return c.json({ error: "送信した部分や容量が一致しません" }, 400);
  // A previous complete may have succeeded in R2 even if the response or D1 update was lost.
  if (await completedObject(c, session)) {
    await markCompleted(c, session);
    return c.json({ status: "completed" });
  }
  if (session.status === "completed") return c.json({ error: "送信済みの動画が見つかりません" }, 409);
  if (!session.writable) return c.json({ error: "この動画はすでにアップロード済みです" }, 409);
  try {
    const object = await c.env.MEDIA.resumeMultipartUpload(session.object_key, session.upload_id).complete(
      parts.map(({ partNumber, etag }) => ({ partNumber, etag })),
    );
    if (object.size !== session.byte_size || object.customMetadata?.["multipart-session"] !== session.id)
      return c.json({ error: "送信した動画を確認できません" }, 409);
  } catch (error) {
    if (!(await completedObject(c, session))) throw error;
  }
  await markCompleted(c, session);
  return c.json({ status: "completed" });
});

multipartRoutes.delete("/media/:mediaId/multipart/:sessionId", async (c) => {
  const session = await ownedSession(c);
  if (!session) return c.json({ error: "送信情報が見つかりません" }, 404);
  if (session.status === "aborted") return c.json({ status: "aborted" });
  if (await completedObject(c, session)) {
    await markCompleted(c, session);
    return c.json({ status: "completed" });
  }
  await abortSession(c, session);
  return c.json({ status: "aborted" });
});

function partCount(session: SessionRow): number {
  return Math.ceil(session.byte_size / MULTIPART_PART_SIZE);
}

function sessionResponse(session: SessionRow): MultipartSession {
  return {
    sessionId: session.id,
    partSize: MULTIPART_PART_SIZE,
    partCount: partCount(session),
    status: session.status === "completed" ? "completed" : "pending",
  };
}

async function ownedSession(c: Context<MultipartEnv>): Promise<SessionRow | null> {
  return c.env.DB.prepare(
    `
    SELECT u.*, CASE WHEN u.variant = 'original' THEN m.status IN ('pending', 'failed')
      ELSE m.playback_status = 'pending' END AS writable
      FROM multipart_uploads u JOIN media m ON m.id = u.media_id JOIN posts p ON p.id = m.post_id
     WHERE u.id = ? AND u.media_id = ? AND m.created_by = ?
       AND p.status IN ('draft', 'published') AND (p.status = 'published' OR p.created_by = ?)
       AND ((u.variant = 'original' AND u.object_key = m.original_object_key AND u.byte_size = m.byte_size)
         OR (u.variant = 'playback' AND u.object_key = m.playback_object_key AND u.byte_size = m.playback_byte_size))
  `,
  )
    .bind(c.req.param("sessionId"), c.req.param("mediaId"), c.var.currentUser.id, c.var.currentUser.id)
    .first<SessionRow>();
}

async function completedObject(c: Context<MultipartEnv>, session: SessionRow): Promise<boolean> {
  const object = await c.env.MEDIA.head(session.object_key);
  return !!object && object.size === session.byte_size && object.customMetadata?.["multipart-session"] === session.id;
}

async function markCompleted(c: Context<MultipartEnv>, session: SessionRow): Promise<void> {
  await c.env.DB.prepare("UPDATE multipart_uploads SET status = 'completed' WHERE id = ?").bind(session.id).run();
}

async function abortSession(c: Context<MultipartEnv>, session: SessionRow): Promise<void> {
  try {
    await c.env.MEDIA.resumeMultipartUpload(session.object_key, session.upload_id).abort();
  } catch (error) {
    // The R2 lifecycle may already have removed an abandoned upload.
    if (!(error instanceof Error) || !/NoSuchUpload|10024/.test(error.message)) throw error;
  }
  await c.env.DB.prepare("UPDATE multipart_uploads SET status = 'aborted' WHERE id = ? AND status = 'pending'")
    .bind(session.id)
    .run();
}

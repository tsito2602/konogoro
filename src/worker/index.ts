import { Hono, type Context } from "hono";
import { ulid } from "ulid";
import { ZodError } from "zod";
import {
  eventInputSchema,
  commentInputSchema,
  mediaCompleteSchema,
  postInputSchema,
  sectionInputSchema,
  uploadFilesSchema,
} from "../shared/schemas";
import type { EventDetail, EventSummary, UploadTarget } from "../shared/types";
import { canCreatePost, canDeleteComment, canManageEvent } from "../shared/permissions";
import type { User } from "../shared/types";
import { getCurrentUser } from "./auth";
import { createPresignedUploadUrl, hasUploadCredentials } from "./r2";
import { loadPosts, postSelect, type PostRow } from "./db";

type Bindings = Cloudflare.Env & R2Secrets;
type EventRow = {
  id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  cover_media_id: string | null;
  post_count: number;
  photo_count: number;
  video_count: number;
};

type AppEnv = { Bindings: Bindings; Variables: { currentUser: User } };
const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  c.set("currentUser", await getCurrentUser(c.env.DB));
  await next();
});

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json({ error: error.issues[0]?.message ?? "入力内容を確認してください" }, 400);
  }
  console.error(JSON.stringify({ message: error.message, stack: error.stack }));
  return c.json({ error: "処理に失敗しました" }, 500);
});

app.notFound((c) => c.json({ error: "見つかりませんでした" }, 404));

app.get("/me", async (c) => {
  return c.json(c.var.currentUser);
});

app.get("/timeline", async (c) => {
  const cursor = parseCursor(c.req.query("cursor"));
  const limit = 20;
  const statement = cursor
    ? c.env.DB.prepare(`${postSelect} WHERE p.status = 'published' AND (p.captured_at < ? OR (p.captured_at = ? AND p.id < ?)) ORDER BY p.captured_at DESC, p.id DESC LIMIT ?`).bind(cursor.capturedAt, cursor.capturedAt, cursor.id, limit + 1)
    : c.env.DB.prepare(`${postSelect} WHERE p.status = 'published' ORDER BY p.captured_at DESC, p.id DESC LIMIT ?`).bind(limit + 1);
  const result = await statement.all<PostRow>();
  const hasMore = result.results.length > limit;
  const rows = result.results.slice(0, limit);
  const posts = await loadPosts(c.env.DB, rows, c.var.currentUser);
  const last = rows.at(-1);
  return c.json({ posts, nextCursor: hasMore && last?.captured_at ? `${last.captured_at}|${last.id}` : null });
});

app.get("/events", async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.cover_media_id,
           COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.id END) AS post_count,
           COUNT(DISTINCT CASE WHEN p.status = 'published' AND m.status = 'uploaded' AND m.kind = 'image' THEN m.id END) AS photo_count,
           COUNT(DISTINCT CASE WHEN p.status = 'published' AND m.status = 'uploaded' AND m.kind = 'video' THEN m.id END) AS video_count
      FROM events e
      LEFT JOIN posts p ON p.event_id = e.id
      LEFT JOIN media m ON m.post_id = p.id
     GROUP BY e.id
     ORDER BY COALESCE(e.start_date, substr(e.created_at, 1, 10)) DESC, e.id DESC
  `).all<EventRow>();
  return c.json({ events: result.results.map(mapEvent) });
});

app.post("/events", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "イベントを作成する権限がありません" }, 403);
  const input = eventInputSchema.parse(await c.req.json());
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO events (id, title, description, start_date, end_date, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, input.title, input.description, input.startDate, input.endDate, c.var.currentUser.id, now, now).run();
  return c.json({ id }, 201);
});

app.get("/events/:eventId", async (c) => {
  const eventId = c.req.param("eventId");
  const event = await c.env.DB.prepare(`
    SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.cover_media_id,
           COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.id END) AS post_count,
           COUNT(DISTINCT CASE WHEN p.status = 'published' AND m.status = 'uploaded' AND m.kind = 'image' THEN m.id END) AS photo_count,
           COUNT(DISTINCT CASE WHEN p.status = 'published' AND m.status = 'uploaded' AND m.kind = 'video' THEN m.id END) AS video_count
      FROM events e
      LEFT JOIN posts p ON p.event_id = e.id
      LEFT JOIN media m ON m.post_id = p.id
     WHERE e.id = ? GROUP BY e.id
  `).bind(eventId).first<EventRow>();
  if (!event) return c.json({ error: "イベントが見つかりません" }, 404);

  const [sectionsResult, postsResult] = await Promise.all([
    c.env.DB.prepare("SELECT id, title, sort_order FROM event_sections WHERE event_id = ? ORDER BY sort_order, id").bind(eventId).all<{ id: string; title: string; sort_order: number }>(),
    c.env.DB.prepare(`${postSelect} WHERE p.event_id = ? AND p.status = 'published' ORDER BY p.captured_at DESC, p.id DESC`).bind(eventId).all<PostRow>(),
  ]);
  const detail: EventDetail = {
    ...mapEvent(event),
    sections: sectionsResult.results.map((section) => ({ id: section.id, title: section.title, sortOrder: section.sort_order })),
    posts: await loadPosts(c.env.DB, postsResult.results, c.var.currentUser),
  };
  return c.json(detail);
});

app.post("/events/:eventId/sections", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "セクションを作成する権限がありません" }, 403);
  const eventId = c.req.param("eventId");
  const input = sectionInputSchema.parse(await c.req.json());
  const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return c.json({ error: "イベントが見つかりません" }, 404);
  const id = ulid();
  const now = new Date().toISOString();
  const order = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM event_sections WHERE event_id = ?").bind(eventId).first<{ value: number }>();
  await c.env.DB.prepare(`INSERT INTO event_sections (id, event_id, title, sort_order, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, eventId, input.title, order?.value ?? 0, c.var.currentUser.id, now, now).run();
  return c.json({ id, title: input.title, sortOrder: order?.value ?? 0 }, 201);
});

app.post("/posts", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const input = postInputSchema.parse(await c.req.json());
  if (input.sectionId && !input.eventId) return c.json({ error: "セクションにはイベントが必要です" }, 400);
  if (input.eventId) {
    const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(input.eventId).first();
    if (!event) return c.json({ error: "イベントが見つかりません" }, 400);
  }
  if (input.sectionId) {
    const section = await c.env.DB.prepare("SELECT id FROM event_sections WHERE id = ? AND event_id = ?").bind(input.sectionId, input.eventId).first();
    if (!section) return c.json({ error: "セクションがイベントと一致しません" }, 400);
  }
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO posts (id, event_id, section_id, title, caption, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, input.eventId, input.sectionId, input.title, input.caption, c.var.currentUser.id, now, now).run();
  return c.json({ id }, 201);
});

app.get("/posts/:postId", async (c) => {
  const result = await c.env.DB.prepare(`${postSelect} WHERE p.id = ? AND p.status = 'published'`).bind(c.req.param("postId")).all<PostRow>();
  if (result.results.length === 0) return c.json({ error: "投稿が見つかりません" }, 404);
  return c.json((await loadPosts(c.env.DB, result.results, c.var.currentUser))[0]);
});

app.post("/posts/:postId/media/upload-urls", async (c) => {
  const postId = c.req.param("postId");
  const input = uploadFilesSchema.parse(await c.req.json());
  const post = await c.env.DB.prepare("SELECT id, status FROM posts WHERE id = ? AND created_by = ?").bind(postId, c.var.currentUser.id).first<{ id: string; status: string }>();
  if (!post || post.status !== "draft") return c.json({ error: "下書き投稿が見つかりません" }, 404);
  if (!hasUploadCredentials(c.env)) {
    return c.json({ error: "R2アップロード用secretが設定されていません" }, 503);
  }

  const lastPosition = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS value FROM media WHERE post_id = ?").bind(postId).first<{ value: number }>();
  const now = new Date().toISOString();
  const records: Array<{ id: string; key: string; thumbnailKey: string; kind: "image" | "video"; filename: string; mimeType: string; byteSize: number; capturedAt: string | null; durationSeconds: number | null; position: number; url: string; thumbnailUrl: string }> = [];

  for (const [index, file] of input.files.entries()) {
    const id = ulid();
    const extension = extensionForMime(file.mimeType);
    const key = `media/${id}/original/original.${extension}`;
    const thumbnailKey = `media/${id}/thumbnail/thumbnail.webp`;
    const [url, thumbnailUrl] = await Promise.all([createPresignedUploadUrl(c.env, key, file.mimeType), createPresignedUploadUrl(c.env, thumbnailKey, "image/webp")]);
    records.push({ id, key, thumbnailKey, kind: file.mimeType.startsWith("video/") ? "video" : "image", filename: file.filename, mimeType: file.mimeType, byteSize: file.byteSize, capturedAt: file.capturedAt, durationSeconds: file.durationSeconds, position: (lastPosition?.value ?? -1) + index + 1, url, thumbnailUrl });
  }

  await c.env.DB.batch(records.map((record) => c.env.DB.prepare(`
    INSERT INTO media (id, post_id, kind, original_filename, mime_type, original_object_key, thumbnail_object_key, byte_size, captured_at, duration_seconds, position, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(record.id, postId, record.kind, record.filename, record.mimeType, record.key, record.thumbnailKey, record.byteSize, record.capturedAt, record.durationSeconds, record.position, c.var.currentUser.id, now)));
  const targets: UploadTarget[] = records.map((record) => ({ id: record.id, uploadUrl: record.url, thumbnailUploadUrl: record.thumbnailUrl, contentType: record.mimeType }));
  return c.json({ media: targets }, 201);
});

app.post("/media/:mediaId/upload-url", async (c) => {
  const media = await c.env.DB.prepare(`
    SELECT m.id, m.original_object_key, m.thumbnail_object_key, m.mime_type
      FROM media m JOIN posts p ON p.id = m.post_id
     WHERE m.id = ? AND m.created_by = ? AND p.status = 'draft' AND m.status IN ('pending', 'failed')
  `).bind(c.req.param("mediaId"), c.var.currentUser.id).first<{ id: string; original_object_key: string; thumbnail_object_key: string; mime_type: string }>();
  if (!media) return c.json({ error: "再試行できるメディアが見つかりません" }, 404);
  const [uploadUrl, thumbnailUploadUrl] = await Promise.all([createPresignedUploadUrl(c.env, media.original_object_key, media.mime_type), createPresignedUploadUrl(c.env, media.thumbnail_object_key, "image/webp")]);
  await c.env.DB.prepare("UPDATE media SET status = 'pending' WHERE id = ?").bind(media.id).run();
  return c.json({ id: media.id, uploadUrl, thumbnailUploadUrl, contentType: media.mime_type } satisfies UploadTarget);
});

app.post("/media/:mediaId/failed", async (c) => {
  const result = await c.env.DB.prepare("UPDATE media SET status = 'failed' WHERE id = ? AND created_by = ? AND status = 'pending'").bind(c.req.param("mediaId"), c.var.currentUser.id).run();
  if (!result.meta.changes) return c.json({ error: "メディアが見つかりません" }, 404);
  return c.json({ id: c.req.param("mediaId"), status: "failed" });
});

app.post("/media/:mediaId/complete", async (c) => {
  const input = mediaCompleteSchema.parse(await c.req.json());
  const mediaId = c.req.param("mediaId");
  const media = await c.env.DB.prepare("SELECT original_object_key, thumbnail_object_key, byte_size, status FROM media WHERE id = ? AND created_by = ?").bind(mediaId, c.var.currentUser.id).first<{ original_object_key: string; thumbnail_object_key: string; byte_size: number; status: string }>();
  if (!media) return c.json({ error: "メディアが見つかりません" }, 404);
  if (media.status === "uploaded") return c.json({ id: mediaId, status: "uploaded" });
  const [object, thumbnail] = await Promise.all([c.env.MEDIA.head(media.original_object_key), c.env.MEDIA.head(media.thumbnail_object_key)]);
  if (!object || object.size !== media.byte_size || !thumbnail) return c.json({ error: "アップロードしたファイルを確認できません" }, 409);
  await c.env.DB.prepare("UPDATE media SET status = 'uploaded', width = ?, height = ?, uploaded_at = ? WHERE id = ?")
    .bind(input.width, input.height, new Date().toISOString(), mediaId).run();
  return c.json({ id: mediaId, status: "uploaded" });
});

app.post("/posts/:postId/publish", async (c) => {
  const postId = c.req.param("postId");
  const post = await c.env.DB.prepare("SELECT id, event_id, status FROM posts WHERE id = ? AND created_by = ?").bind(postId, c.var.currentUser.id).first<{ id: string; event_id: string | null; status: string }>();
  if (!post) return c.json({ error: "投稿が見つかりません" }, 404);
  if (post.status === "published") return c.json({ id: postId });
  const summary = await c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) AS uploaded, MIN(COALESCE(captured_at, uploaded_at)) AS captured_at FROM media WHERE post_id = ?").bind(postId).first<{ total: number; uploaded: number; captured_at: string | null }>();
  if (!summary || summary.total === 0 || summary.total !== summary.uploaded) return c.json({ error: "すべての写真・動画のアップロードを完了してください" }, 409);
  const now = new Date().toISOString();
  const statements = [c.env.DB.prepare("UPDATE posts SET status = 'published', captured_at = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(summary.captured_at ?? now, now, now, postId)];
  if (post.event_id) {
    statements.push(c.env.DB.prepare(`
      UPDATE events SET cover_media_id = COALESCE(cover_media_id, (SELECT id FROM media WHERE post_id = ? AND status = 'uploaded' ORDER BY position LIMIT 1)),
                        cover_object_key = COALESCE(cover_object_key, (SELECT original_object_key FROM media WHERE post_id = ? AND status = 'uploaded' ORDER BY position LIMIT 1)), updated_at = ?
       WHERE id = ? AND cover_source = 'auto'
    `).bind(postId, postId, now, post.event_id));
  }
  await c.env.DB.batch(statements);
  return c.json({ id: postId });
});

app.get("/media/:mediaId/content", async (c) => serveMedia(c, false));
app.get("/media/:mediaId/download", async (c) => serveMedia(c, true));

app.post("/posts/:postId/comments", async (c) => {
  const input = commentInputSchema.parse(await c.req.json());
  const postId = c.req.param("postId");
  const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(postId).first();
  if (!post) return c.json({ error: "投稿が見つかりません" }, 404);
  const id = ulid();
  const now = new Date().toISOString();
  await c.env.DB.prepare("INSERT INTO comments (id, post_id, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, postId, c.var.currentUser.id, input.body, now, now).run();
  return c.json({ id, body: input.body, userId: c.var.currentUser.id, authorName: c.var.currentUser.displayName, createdAt: now, canDelete: true }, 201);
});

app.delete("/comments/:commentId", async (c) => {
  const comment = await c.env.DB.prepare("SELECT user_id FROM comments WHERE id = ?").bind(c.req.param("commentId")).first<{ user_id: string }>();
  if (!comment) return c.json({ error: "コメントが見つかりません" }, 404);
  if (!canDeleteComment(c.var.currentUser, comment.user_id)) return c.json({ error: "コメントを削除する権限がありません" }, 403);
  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(c.req.param("commentId")).run();
  return c.body(null, 204);
});

app.post("/posts/:postId/view", async (c) => {
  const postId = c.req.param("postId");
  const post = await c.env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(postId).first();
  if (!post) return c.json({ error: "投稿が見つかりません" }, 404);
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT INTO view_histories (id, post_id, user_id, first_viewed_at, last_viewed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(post_id, user_id) DO UPDATE SET last_viewed_at = excluded.last_viewed_at
  `).bind(ulid(), postId, c.var.currentUser.id, now, now).run();
  return c.json({ status: "viewed" });
});

function mapEvent(row: EventRow): EventSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    coverUrl: row.cover_media_id ? `/api/media/${row.cover_media_id}/content?variant=thumbnail` : null,
    postCount: Number(row.post_count),
    photoCount: Number(row.photo_count),
    videoCount: Number(row.video_count),
  };
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "mp4";
}

function parseCursor(value: string | undefined): { capturedAt: string; id: string } | null {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  if (separator < 1 || separator === value.length - 1) return null;
  return { capturedAt: value.slice(0, separator), id: value.slice(separator + 1) };
}

async function serveMedia(c: Context<AppEnv>, download: boolean): Promise<Response> {
  const media = await c.env.DB.prepare("SELECT original_object_key, thumbnail_object_key, mime_type, original_filename FROM media WHERE id = ? AND status = 'uploaded'").bind(c.req.param("mediaId")).first<{ original_object_key: string; thumbnail_object_key: string | null; mime_type: string; original_filename: string }>();
  if (!media) return c.json({ error: "メディアが見つかりません" }, 404);
  const thumbnail = !download && c.req.query("variant") === "thumbnail" && media.thumbnail_object_key;
  const object = await c.env.MEDIA.get(thumbnail ? media.thumbnail_object_key! : media.original_object_key);
  if (!object) return c.json({ error: "ファイルが見つかりません" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", thumbnail ? "image/webp" : media.mime_type);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("ETag", object.httpEtag);
  if (download) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(media.original_filename)}`);
  return new Response(object.body, { headers });
}

export default app;

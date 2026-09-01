import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ulid } from "ulid";
import { ZodError } from "zod";
import {
  eventInputSchema,
  eventCoverInputSchema,
  commentInputSchema,
  mediaCompleteSchema,
  postInputSchema,
  sectionInputSchema,
  uploadFilesSchema,
  inviteInputSchema,
  memberRoleInputSchema,
  profileInputSchema,
} from "../shared/schemas";
import type { EventCoverMedia, EventDetail, EventSummary, UploadTarget } from "../shared/types";
import { canCreatePost, canDeleteComment, canDeletePost, canInviteFamily, canManageEvent } from "../shared/permissions";
import type { User } from "../shared/types";
import { getCurrentUser, hashToken, hasLineConfig, pkceChallenge, randomToken, safeEqual, type LineSecrets } from "./auth";
import { createPresignedUploadUrl, hasUploadCredentials } from "./r2";
import { loadPosts, postSelect, type PostRow } from "./db";
import { matchesUploadFiles, type ExistingMedia } from "./upload-request";
import { createInviteToken } from "./invite-token";
import { processNotificationBatches, type NotificationCronEnv } from "./notification-cron";
import { addPostToNotificationBatch } from "./notification-batch";

type Bindings = Cloudflare.Env & R2Secrets & LineSecrets;
type EventRow = {
  id: string;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  cover_media_id: string | null;
  cover_source: "auto" | "manual";
  post_count: number;
  photo_count: number;
  video_count: number;
};

type AppEnv = { Bindings: Bindings; Variables: { currentUser: User } };
export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  const publicAuth = c.req.path === "/api/auth/line" || c.req.path === "/api/auth/line/callback";
  const lineConfigured = hasLineConfig(c.env);
  const localDevelopment = !lineConfigured || new URL(c.env.APP_ORIGIN!).hostname === "localhost";
  const user = await getCurrentUser(c.env.DB, lineConfigured ? getCookie(c, "family_session") : undefined, localDevelopment);
  if (!user && !publicAuth) return c.json({ error: "ログインが必要です" }, 401);
  if (user) c.set("currentUser", user);
  await next();
});

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json({ error: error.issues[0]?.message ?? "入力内容を確認してください" }, 400);
  }
  console.error({
    event: "api_error",
    message: error.message,
    stack: error.stack,
    method: c.req.method,
    path: c.req.path,
    requestId: c.req.header("cf-ray"),
  });
  return c.json({ error: "処理に失敗しました" }, 500);
});

app.notFound((c) => c.json({ error: "見つかりませんでした" }, 404));

app.get("/me", async (c) => {
  const profile = await c.env.DB.prepare("SELECT avatar_url, line_user_id, notification_enabled FROM users WHERE id = ?").bind(c.var.currentUser.id).first<{ avatar_url: string | null; line_user_id: string | null; notification_enabled: number }>();
  return c.json({ ...c.var.currentUser, avatarUrl: profile?.avatar_url ?? null, lineConnected: Boolean(profile?.line_user_id), notificationEnabled: Boolean(profile?.notification_enabled) });
});

app.patch("/me", async (c) => {
  const input = profileInputSchema.parse(await c.req.json());
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    UPDATE users
       SET display_name = COALESCE(?, display_name),
           notification_enabled = COALESCE(?, notification_enabled),
           updated_at = ?
     WHERE id = ?
  `).bind(input.displayName ?? null, input.notificationEnabled === undefined ? null : Number(input.notificationEnabled), now, c.var.currentUser.id).run();
  const user = await c.env.DB.prepare("SELECT id, display_name, role, avatar_url, line_user_id, notification_enabled FROM users WHERE id = ?").bind(c.var.currentUser.id).first<{ id: string; display_name: string; role: User["role"]; avatar_url: string | null; line_user_id: string | null; notification_enabled: number }>();
  if (!user) return c.json({ error: "ユーザーが見つかりません" }, 404);
  return c.json({ id: user.id, displayName: user.display_name, role: user.role, avatarUrl: user.avatar_url, lineConnected: Boolean(user.line_user_id), notificationEnabled: Boolean(user.notification_enabled) });
});

app.get("/auth/line", async (c) => {
  if (!hasLineConfig(c.env)) return c.json({ error: "LINE Loginが設定されていません" }, 503);
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const cookie = { httpOnly: true, secure: true, sameSite: "Lax" as const, maxAge: 600, path: "/api/auth/line/callback" };
  setCookie(c, "line_state", state, cookie);
  setCookie(c, "line_nonce", nonce, cookie);
  setCookie(c, "line_verifier", verifier, cookie);
  const invite = c.req.query("invite");
  if (invite) setCookie(c, "line_invite", invite, cookie);
  const callback = `${c.env.APP_ORIGIN}/api/auth/line/callback`;
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.search = new URLSearchParams({ response_type: "code", client_id: c.env.LINE_CHANNEL_ID, redirect_uri: callback, state, scope: "profile openid", nonce, code_challenge: await pkceChallenge(verifier), code_challenge_method: "S256" }).toString();
  return c.redirect(url.toString());
});

app.get("/auth/line/callback", async (c) => {
  if (!hasLineConfig(c.env)) return c.json({ error: "LINE Loginが設定されていません" }, 503);
  const state = getCookie(c, "line_state");
  const nonce = getCookie(c, "line_nonce");
  const verifier = getCookie(c, "line_verifier");
  const receivedState = c.req.query("state");
  const code = c.req.query("code");
  if (!state || !nonce || !verifier || !receivedState || !safeEqual(state, receivedState) || !code) return c.json({ error: "ログイン要求を確認できません" }, 400);
  const redirectUri = `${c.env.APP_ORIGIN}/api/auth/line/callback`;
  const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: c.env.LINE_CHANNEL_ID, client_secret: c.env.LINE_CHANNEL_SECRET, code_verifier: verifier }) });
  if (!tokenResponse.ok) return c.json({ error: "LINE Loginを完了できません" }, 502);
  const token = await tokenResponse.json<{ id_token: string }>();
  const verifyResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ id_token: token.id_token, client_id: c.env.LINE_CHANNEL_ID, nonce }) });
  if (!verifyResponse.ok) return c.json({ error: "LINEアカウントを確認できません" }, 502);
  const profile = await verifyResponse.json<{ sub: string; name?: string; picture?: string }>();
  let user = await c.env.DB.prepare("SELECT id FROM users WHERE line_user_id = ?").bind(profile.sub).first<{ id: string }>();
  if (!user) {
    const inviteToken = getCookie(c, "line_invite");
    if (!inviteToken) return c.json({ error: "有効な招待が必要です" }, 403);
    const invite = await c.env.DB.prepare("UPDATE invites SET use_count = use_count + 1 WHERE token_hash = ? AND expires_at > ? AND use_count < max_uses RETURNING role").bind(await hashToken(inviteToken), new Date().toISOString()).first<{ role: User["role"] }>();
    if (!invite) return c.json({ error: "招待URLが無効または期限切れです" }, 403);
    user = { id: ulid() };
    const now = new Date().toISOString();
    await c.env.DB.prepare("INSERT INTO users (id, line_user_id, display_name, avatar_url, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(user.id, profile.sub, profile.name ?? "LINEユーザー", profile.picture ?? null, invite.role, now, now).run();
  }
  const session = randomToken();
  const now = new Date();
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await hashToken(session), user.id, new Date(now.getTime() + 30 * 86400000).toISOString(), now.toISOString()).run();
  setCookie(c, "family_session", session, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 30 * 86400, path: "/" });
  for (const name of ["line_state", "line_nonce", "line_verifier", "line_invite"]) deleteCookie(c, name, { path: "/api/auth/line/callback" });
  return c.redirect(c.env.APP_ORIGIN);
});

app.post("/auth/logout", async (c) => {
  const session = getCookie(c, "family_session");
  if (session) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(session)).run();
  deleteCookie(c, "family_session", { path: "/" });
  return c.body(null, 204);
});

app.get("/family/members", async (c) => {
  if (!canInviteFamily(c.var.currentUser)) return c.json({ error: "家族情報を表示する権限がありません" }, 403);
  const result = await c.env.DB.prepare(`
    SELECT id, display_name, role, avatar_url, line_user_id, notification_enabled, created_at
      FROM users
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'uploader' THEN 1 ELSE 2 END, created_at, id
  `).all<{ id: string; display_name: string; role: User["role"]; avatar_url: string | null; line_user_id: string | null; notification_enabled: number; created_at: string }>();
  return c.json({ members: result.results.map((member) => ({
    id: member.id,
    displayName: member.display_name,
    role: member.role,
    avatarUrl: member.avatar_url,
    lineConnected: Boolean(member.line_user_id),
    notificationEnabled: Boolean(member.notification_enabled),
    joinedAt: member.created_at,
  })) });
});

app.patch("/family/members/:memberId", async (c) => {
  if (!canInviteFamily(c.var.currentUser)) return c.json({ error: "メンバーの権限を変更する権限がありません" }, 403);
  const memberId = c.req.param("memberId");
  if (memberId === c.var.currentUser.id) return c.json({ error: "自分の権限は変更できません" }, 400);
  const input = memberRoleInputSchema.parse(await c.req.json());
  const member = await c.env.DB.prepare(`
    UPDATE users
       SET role = ?, updated_at = ?
     WHERE id = ?
     RETURNING id, display_name, role, avatar_url, line_user_id, notification_enabled
  `).bind(input.role, new Date().toISOString(), memberId).first<{ id: string; display_name: string; role: User["role"]; avatar_url: string | null; line_user_id: string | null; notification_enabled: number }>();
  if (!member) return c.json({ error: "メンバーが見つかりません" }, 404);
  return c.json({
    id: member.id,
    displayName: member.display_name,
    role: member.role,
    avatarUrl: member.avatar_url,
    lineConnected: Boolean(member.line_user_id),
    notificationEnabled: Boolean(member.notification_enabled),
  });
});

app.post("/family/invites", async (c) => {
  if (!canInviteFamily(c.var.currentUser)) return c.json({ error: "家族を招待する権限がありません" }, 403);
  const input = inviteInputSchema.parse(await c.req.json());
  const { token, tokenHash } = await createInviteToken();
  const id = ulid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare(`
    INSERT INTO invites (id, token_hash, role, expires_at, max_uses, use_count, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(id, tokenHash, input.role, expiresAt, input.maxUses, c.var.currentUser.id, now.toISOString()).run();
  const inviteUrl = new URL(`/invite/${token}`, c.req.url).toString();
  return c.json({ id, inviteUrl, role: input.role, expiresAt, maxUses: input.maxUses }, 201);
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
    SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.cover_media_id, e.cover_source,
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

app.put("/events/:eventId", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "イベントを編集する権限がありません" }, 403);
  const input = eventInputSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare("UPDATE events SET title = ?, description = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?")
    .bind(input.title, input.description, input.startDate, input.endDate, new Date().toISOString(), c.req.param("eventId")).run();
  if (!result.meta.changes) return c.json({ error: "イベントが見つかりません" }, 404);
  return c.json({ id: c.req.param("eventId") });
});

app.delete("/events/:eventId", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "イベントを削除する権限がありません" }, 403);
  const eventId = c.req.param("eventId");
  const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return c.json({ error: "イベントが見つかりません" }, 404);
  const [, result] = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET section_id = NULL WHERE event_id = ?").bind(eventId),
    c.env.DB.prepare("DELETE FROM events WHERE id = ?").bind(eventId),
  ]);
  if (!result.meta.changes) return c.json({ error: "イベントが見つかりません" }, 404);
  return c.json({ id: eventId });
});

app.get("/events/:eventId", async (c) => {
  const eventId = c.req.param("eventId");
  const event = await c.env.DB.prepare(`
    SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.cover_media_id, e.cover_source,
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

app.put("/events/:eventId/sections/:sectionId", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "セクションを編集する権限がありません" }, 403);
  const input = sectionInputSchema.parse(await c.req.json());
  const result = await c.env.DB.prepare("UPDATE event_sections SET title = ?, updated_at = ? WHERE id = ? AND event_id = ?")
    .bind(input.title, new Date().toISOString(), c.req.param("sectionId"), c.req.param("eventId")).run();
  if (!result.meta.changes) return c.json({ error: "セクションが見つかりません" }, 404);
  return c.json({ id: c.req.param("sectionId"), title: input.title });
});

app.delete("/events/:eventId/sections/:sectionId", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "セクションを削除する権限がありません" }, 403);
  const used = await c.env.DB.prepare("SELECT id FROM posts WHERE section_id = ? LIMIT 1").bind(c.req.param("sectionId")).first();
  if (used) return c.json({ error: "投稿があるセクションは削除できません" }, 409);
  const result = await c.env.DB.prepare("DELETE FROM event_sections WHERE id = ? AND event_id = ?").bind(c.req.param("sectionId"), c.req.param("eventId")).run();
  if (!result.meta.changes) return c.json({ error: "セクションが見つかりません" }, 404);
  return c.json({ id: c.req.param("sectionId") });
});

app.get("/events/:eventId/cover-media", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "カバー候補を表示する権限がありません" }, 403);
  const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(c.req.param("eventId")).first();
  if (!event) return c.json({ error: "イベントが見つかりません" }, 404);
  const result = await c.env.DB.prepare(`
    SELECT m.id, m.kind FROM media m JOIN posts p ON p.id = m.post_id
     WHERE p.event_id = ? AND p.status = 'published' AND m.status = 'uploaded'
     ORDER BY COALESCE(m.captured_at, p.captured_at, p.created_at), m.position, m.id
  `).bind(c.req.param("eventId")).all<{ id: string; kind: "image" | "video" }>();
  const media: EventCoverMedia[] = result.results.map((item) => ({ id: item.id, kind: item.kind, thumbnailUrl: `/api/media/${item.id}/content?variant=thumbnail` }));
  return c.json({ media });
});

app.put("/events/:eventId/cover", async (c) => {
  if (!canManageEvent(c.var.currentUser)) return c.json({ error: "カバーを変更する権限がありません" }, 403);
  const body = eventCoverInputSchema.parse(await c.req.json());
  const eventId = c.req.param("eventId");
  const now = new Date().toISOString();
  if (body.mediaId) {
    const media = await c.env.DB.prepare(`SELECT m.id, m.original_object_key FROM media m JOIN posts p ON p.id = m.post_id WHERE m.id = ? AND p.event_id = ? AND p.status = 'published' AND m.status = 'uploaded'`)
      .bind(body.mediaId, eventId).first<{ id: string; original_object_key: string }>();
    if (!media) return c.json({ error: "カバーに設定できるメディアが見つかりません" }, 400);
    await c.env.DB.prepare("UPDATE events SET cover_media_id = ?, cover_object_key = ?, cover_source = 'manual', updated_at = ? WHERE id = ?")
      .bind(media.id, media.original_object_key, now, eventId).run();
  } else {
    const event = await c.env.DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
    if (!event) return c.json({ error: "イベントが見つかりません" }, 404);
    await c.env.DB.prepare(`UPDATE events SET
      cover_media_id = (SELECT m.id FROM media m JOIN posts p ON p.id = m.post_id WHERE p.event_id = events.id AND p.status = 'published' AND m.status = 'uploaded' ORDER BY CASE WHEN m.kind = 'image' THEN 0 ELSE 1 END, COALESCE(m.captured_at, p.captured_at, p.created_at), m.position, m.id LIMIT 1),
      cover_object_key = (SELECT m.original_object_key FROM media m JOIN posts p ON p.id = m.post_id WHERE p.event_id = events.id AND p.status = 'published' AND m.status = 'uploaded' ORDER BY CASE WHEN m.kind = 'image' THEN 0 ELSE 1 END, COALESCE(m.captured_at, p.captured_at, p.created_at), m.position, m.id LIMIT 1),
      cover_source = 'auto', updated_at = ? WHERE id = ?`).bind(now, eventId).run();
  }
  return c.json({ id: eventId });
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

app.delete("/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  const post = await c.env.DB.prepare("SELECT created_by, event_id FROM posts WHERE id = ?").bind(postId).first<{ created_by: string; event_id: string | null }>();
  if (!post) return c.json({ error: "投稿が見つかりません" }, 404);
  if (!canDeletePost(c.var.currentUser, post.created_by)) return c.json({ error: "投稿を削除する権限がありません" }, 403);

  const media = await c.env.DB.prepare("SELECT original_object_key, preview_object_key, thumbnail_object_key FROM media WHERE post_id = ?").bind(postId).all<{ original_object_key: string; preview_object_key: string | null; thumbnail_object_key: string | null }>();
  const statements = [c.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId)];
  if (post.event_id) {
    statements.push(c.env.DB.prepare(`
      UPDATE events SET cover_media_id = (
                          SELECT m.id FROM media m JOIN posts p ON p.id = m.post_id
                           WHERE p.event_id = events.id AND p.status = 'published' AND m.status = 'uploaded'
                           ORDER BY CASE WHEN m.kind = 'image' THEN 0 ELSE 1 END,
                                    COALESCE(m.captured_at, p.captured_at, p.published_at, p.created_at), m.position, m.id
                           LIMIT 1
                        ),
                        cover_object_key = (
                          SELECT m.original_object_key FROM media m JOIN posts p ON p.id = m.post_id
                           WHERE p.event_id = events.id AND p.status = 'published' AND m.status = 'uploaded'
                           ORDER BY CASE WHEN m.kind = 'image' THEN 0 ELSE 1 END,
                                    COALESCE(m.captured_at, p.captured_at, p.published_at, p.created_at), m.position, m.id
                           LIMIT 1
                        ), updated_at = ?
       WHERE id = ? AND cover_source = 'auto'
    `).bind(new Date().toISOString(), post.event_id));
  }
  await c.env.DB.batch(statements);

  const keys = media.results.flatMap((item) => [item.original_object_key, item.preview_object_key, item.thumbnail_object_key]).filter((key): key is string => Boolean(key));
  if (keys.length > 0) {
    try {
      await c.env.MEDIA.delete(keys);
    } catch (error) {
      console.error({ event: "r2_delete_error", message: "投稿削除後のR2オブジェクト削除に失敗しました", postId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return c.body(null, 204);
});

app.post("/posts/:postId/media/upload-urls", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const postId = c.req.param("postId");
  const input = uploadFilesSchema.parse(await c.req.json());
  const post = await c.env.DB.prepare("SELECT id, status FROM posts WHERE id = ? AND created_by = ?").bind(postId, c.var.currentUser.id).first<{ id: string; status: string }>();
  if (!post || post.status !== "draft") return c.json({ error: "下書き投稿が見つかりません" }, 404);
  if (!hasUploadCredentials(c.env)) {
    return c.json({ error: "R2アップロード用secretが設定されていません" }, 503);
  }

  const existing = await c.env.DB.prepare(`
    SELECT id, original_filename, mime_type, original_object_key, preview_object_key, thumbnail_object_key,
           byte_size, captured_at, duration_seconds
      FROM media
     WHERE post_id = ?
     ORDER BY position, id
  `).bind(postId).all<ExistingMedia & { id: string; original_object_key: string; preview_object_key: string | null; thumbnail_object_key: string }>();
  if (existing.results.length > 0) {
    if (!matchesUploadFiles(existing.results, input.files)) {
      return c.json({ error: "下書きの写真・動画が選択内容と一致しません" }, 409);
    }
    const targets = await Promise.all(existing.results.map(async (media) => {
      const [uploadUrl, thumbnailUploadUrl, previewUploadUrl] = await Promise.all([
        createPresignedUploadUrl(c.env, media.original_object_key, media.mime_type),
        createPresignedUploadUrl(c.env, media.thumbnail_object_key, "image/webp"),
        media.preview_object_key ? createPresignedUploadUrl(c.env, media.preview_object_key, "image/webp") : undefined,
      ]);
      return { id: media.id, uploadUrl, thumbnailUploadUrl, previewUploadUrl, contentType: media.mime_type } satisfies UploadTarget;
    }));
    return c.json({ media: targets });
  }

  const lastPosition = await c.env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS value FROM media WHERE post_id = ?").bind(postId).first<{ value: number }>();
  const now = new Date().toISOString();
  const records: Array<{ id: string; key: string; previewKey: string | null; thumbnailKey: string; kind: "image" | "video"; filename: string; mimeType: string; byteSize: number; capturedAt: string | null; durationSeconds: number | null; position: number; url: string; previewUrl?: string; thumbnailUrl: string }> = [];

  for (const [index, file] of input.files.entries()) {
    const id = ulid();
    const extension = extensionForMime(file.mimeType);
    const key = `media/${id}/original/original.${extension}`;
    const previewKey = file.mimeType.startsWith("image/") ? `media/${id}/preview/preview.webp` : null;
    const thumbnailKey = `media/${id}/thumbnail/thumbnail.webp`;
    const [url, previewUrl, thumbnailUrl] = await Promise.all([createPresignedUploadUrl(c.env, key, file.mimeType), previewKey ? createPresignedUploadUrl(c.env, previewKey, "image/webp") : undefined, createPresignedUploadUrl(c.env, thumbnailKey, "image/webp")]);
    records.push({ id, key, previewKey, thumbnailKey, kind: file.mimeType.startsWith("video/") ? "video" : "image", filename: file.filename, mimeType: file.mimeType, byteSize: file.byteSize, capturedAt: file.capturedAt, durationSeconds: file.durationSeconds, position: (lastPosition?.value ?? -1) + index + 1, url, previewUrl, thumbnailUrl });
  }

  await c.env.DB.batch(records.map((record) => c.env.DB.prepare(`
    INSERT INTO media (id, post_id, kind, original_filename, mime_type, original_object_key, preview_object_key, thumbnail_object_key, byte_size, captured_at, duration_seconds, position, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(record.id, postId, record.kind, record.filename, record.mimeType, record.key, record.previewKey, record.thumbnailKey, record.byteSize, record.capturedAt, record.durationSeconds, record.position, c.var.currentUser.id, now)));
  const targets: UploadTarget[] = records.map((record) => ({ id: record.id, uploadUrl: record.url, previewUploadUrl: record.previewUrl, thumbnailUploadUrl: record.thumbnailUrl, contentType: record.mimeType }));
  return c.json({ media: targets }, 201);
});

app.post("/media/:mediaId/upload-url", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const media = await c.env.DB.prepare(`
    SELECT m.id, m.original_object_key, m.preview_object_key, m.thumbnail_object_key, m.mime_type
      FROM media m JOIN posts p ON p.id = m.post_id
     WHERE m.id = ? AND m.created_by = ? AND p.status = 'draft' AND m.status IN ('pending', 'failed')
  `).bind(c.req.param("mediaId"), c.var.currentUser.id).first<{ id: string; original_object_key: string; preview_object_key: string | null; thumbnail_object_key: string; mime_type: string }>();
  if (!media) return c.json({ error: "再試行できるメディアが見つかりません" }, 404);
  const [uploadUrl, thumbnailUploadUrl, previewUploadUrl] = await Promise.all([createPresignedUploadUrl(c.env, media.original_object_key, media.mime_type), createPresignedUploadUrl(c.env, media.thumbnail_object_key, "image/webp"), media.preview_object_key ? createPresignedUploadUrl(c.env, media.preview_object_key, "image/webp") : undefined]);
  await c.env.DB.prepare("UPDATE media SET status = 'pending' WHERE id = ?").bind(media.id).run();
  return c.json({ id: media.id, uploadUrl, thumbnailUploadUrl, previewUploadUrl, contentType: media.mime_type } satisfies UploadTarget);
});

app.post("/media/:mediaId/failed", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const result = await c.env.DB.prepare("UPDATE media SET status = 'failed' WHERE id = ? AND created_by = ? AND status = 'pending'").bind(c.req.param("mediaId"), c.var.currentUser.id).run();
  if (!result.meta.changes) return c.json({ error: "メディアが見つかりません" }, 404);
  return c.json({ id: c.req.param("mediaId"), status: "failed" });
});

app.post("/media/:mediaId/complete", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const input = mediaCompleteSchema.parse(await c.req.json());
  const mediaId = c.req.param("mediaId");
  const media = await c.env.DB.prepare("SELECT original_object_key, preview_object_key, thumbnail_object_key, byte_size, status FROM media WHERE id = ? AND created_by = ?").bind(mediaId, c.var.currentUser.id).first<{ original_object_key: string; preview_object_key: string | null; thumbnail_object_key: string; byte_size: number; status: string }>();
  if (!media) return c.json({ error: "メディアが見つかりません" }, 404);
  if (media.status === "uploaded") return c.json({ id: mediaId, status: "uploaded" });
  const [object, preview, thumbnail] = await Promise.all([c.env.MEDIA.head(media.original_object_key), media.preview_object_key ? c.env.MEDIA.head(media.preview_object_key) : undefined, c.env.MEDIA.head(media.thumbnail_object_key)]);
  if (!object || object.size !== media.byte_size || (media.preview_object_key && !preview) || !thumbnail) return c.json({ error: "アップロードしたファイルを確認できません" }, 409);
  await c.env.DB.prepare("UPDATE media SET status = 'uploaded', width = ?, height = ?, uploaded_at = ? WHERE id = ?")
    .bind(input.width, input.height, new Date().toISOString(), mediaId).run();
  return c.json({ id: mediaId, status: "uploaded" });
});

app.post("/posts/:postId/publish", async (c) => {
  if (!canCreatePost(c.var.currentUser)) return c.json({ error: "投稿する権限がありません" }, 403);
  const postId = c.req.param("postId");
  const post = await c.env.DB.prepare("SELECT id, event_id, status, published_at FROM posts WHERE id = ? AND created_by = ?").bind(postId, c.var.currentUser.id).first<{ id: string; event_id: string | null; status: string; published_at: string | null }>();
  if (!post) return c.json({ error: "投稿が見つかりません" }, 404);
  if (post.status === "published") {
    await addPostToNotificationBatch(c.env.DB, postId, post.published_at ?? new Date().toISOString());
    return c.json({ id: postId });
  }
  const summary = await c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) AS uploaded, MIN(COALESCE(captured_at, uploaded_at)) AS captured_at FROM media WHERE post_id = ?").bind(postId).first<{ total: number; uploaded: number; captured_at: string | null }>();
  if (!summary || summary.total === 0 || summary.total !== summary.uploaded) return c.json({ error: "すべての写真・動画のアップロードを完了してください" }, 409);
  const now = new Date().toISOString();
  const statements = [c.env.DB.prepare("UPDATE posts SET status = 'published', captured_at = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(summary.captured_at ?? now, now, now, postId)];
  if (post.event_id) {
    statements.push(c.env.DB.prepare(`
      UPDATE events SET cover_media_id = (
                          SELECT m.id FROM media m JOIN posts p ON p.id = m.post_id
                           WHERE p.event_id = events.id AND p.status = 'published' AND m.status = 'uploaded'
                           ORDER BY CASE WHEN m.kind = 'image' THEN 0 ELSE 1 END,
                                    COALESCE(m.captured_at, p.captured_at, p.published_at, p.created_at), m.position, m.id
                           LIMIT 1
                        ),
                        cover_object_key = (
                          SELECT m.original_object_key FROM media m JOIN posts p ON p.id = m.post_id
                           WHERE p.event_id = events.id AND p.status = 'published' AND m.status = 'uploaded'
                           ORDER BY CASE WHEN m.kind = 'image' THEN 0 ELSE 1 END,
                                    COALESCE(m.captured_at, p.captured_at, p.published_at, p.created_at), m.position, m.id
                           LIMIT 1
                        ), updated_at = ?
       WHERE id = ? AND cover_source = 'auto'
    `).bind(now, post.event_id));
  }
  await c.env.DB.batch(statements);
  await addPostToNotificationBatch(c.env.DB, postId, now);
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
    coverSource: row.cover_source,
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
  const media = await c.env.DB.prepare("SELECT original_object_key, preview_object_key, thumbnail_object_key, mime_type, original_filename FROM media WHERE id = ? AND status = 'uploaded'").bind(c.req.param("mediaId")).first<{ original_object_key: string; preview_object_key: string | null; thumbnail_object_key: string | null; mime_type: string; original_filename: string }>();
  if (!media) return c.json({ error: "メディアが見つかりません" }, 404);
  const thumbnail = !download && c.req.query("variant") === "thumbnail" && media.thumbnail_object_key;
  const preview = !download && c.req.query("variant") === "preview" && media.preview_object_key;
  const range = !thumbnail && !preview && !download && media.mime_type.startsWith("video/") ? c.req.header("Range") : undefined;
  const object = await c.env.MEDIA.get(thumbnail ? media.thumbnail_object_key! : preview ? media.preview_object_key! : media.original_object_key, range ? { range: c.req.raw.headers } : undefined);
  if (!object) return c.json({ error: "ファイルが見つかりません" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", thumbnail || preview ? "image/webp" : media.mime_type);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  if (download) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(media.original_filename)}`);
  if (range && object.range) {
    const offset = "suffix" in object.range ? Math.max(object.size - object.range.suffix, 0) : (object.range.offset ?? 0);
    const requestedLength = "suffix" in object.range ? object.range.suffix : (object.range.length ?? object.size - offset);
    const length = Math.min(requestedLength, object.size - offset);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: NotificationCronEnv): Promise<void> {
    await processNotificationBatches(env);
  },
};

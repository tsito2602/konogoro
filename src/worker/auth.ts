import type { User } from "../shared/types";

const DEV_USER_ID = "01JDEVUSER0000000000000000";

export type LineSecrets = { LINE_CHANNEL_ID?: string; LINE_CHANNEL_SECRET?: string; APP_ORIGIN?: string };

export function hasLineConfig(env: LineSecrets): env is Required<LineSecrets> {
  return Boolean(env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET && env.APP_ORIGIN);
}

export async function getCurrentUser(db: D1Database, sessionToken?: string, allowDevFallback = true): Promise<User | null> {
  const user = sessionToken
    ? await db.prepare("SELECT u.id, u.display_name, u.role, u.avatar_url FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1")
      .bind(await hashToken(sessionToken), new Date().toISOString()).first<{ id: string; display_name: string; role: User["role"]; avatar_url: string | null }>()
    : allowDevFallback
      ? await db.prepare("SELECT id, display_name, role, avatar_url FROM users WHERE id = ? AND is_active = 1").bind(DEV_USER_ID).first<{ id: string; display_name: string; role: User["role"]; avatar_url: string | null }>()
      : null;
  return user ? { id: user.id, displayName: user.display_name, role: user.role, avatarUrl: user.avatar_url } : null;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const session = randomToken();
  const now = new Date();
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await hashToken(session), userId, new Date(now.getTime() + 30 * 86400000).toISOString(), now.toISOString()).run();
  return session;
}

export function randomToken(bytes = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function getLineFriendship(accessToken: string, fetcher: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const response = await fetcher("https://api.line.me/friendship/v1/status", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const result = await response.json<{ friendFlag?: unknown }>();
    return typeof result.friendFlag === "boolean" ? result.friendFlag : null;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

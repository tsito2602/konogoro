export type LineWebhookSecrets = { LINE_MESSAGING_CHANNEL_SECRET?: string };

type LineWebhookEvent = {
  type?: unknown;
  source?: {
    userId?: unknown;
  };
};

export async function verifyLineWebhookSignature(
  body: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    const decoded = atob(signature);
    signatureBytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) signatureBytes[index] = decoded.charCodeAt(index);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(body));
}

export function lineFriendshipStatements(db: D1Database, events: unknown[], updatedAt: string): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const { type, source } = event as LineWebhookEvent;
    const userId = source?.userId;
    if ((type !== "follow" && type !== "unfollow") || typeof userId !== "string" || !userId) continue;
    statements.push(
      type === "follow"
        ? db
            .prepare(
              `
          UPDATE users
             SET line_friend_enabled = 1, updated_at = ?
           WHERE line_user_id = ? AND is_active = 1
        `,
            )
            .bind(updatedAt, userId)
        : db
            .prepare(
              `
          UPDATE users
             SET line_friend_enabled = 0, notification_enabled = 0, updated_at = ?
           WHERE line_user_id = ? AND is_active = 1
        `,
            )
            .bind(updatedAt, userId),
    );
  }
  return statements;
}

import type { User } from "../shared/types";

const DEV_USER_ID = "01JDEVUSER0000000000000000";

export async function getCurrentUser(db: D1Database): Promise<User> {
  const user = await db.prepare(
    "SELECT id, display_name, role FROM users WHERE id = ?",
  ).bind(DEV_USER_ID).first<{ id: string; display_name: string; role: User["role"] }>();
  if (!user) throw new Error("開発ユーザーが見つかりません");
  return { id: user.id, displayName: user.display_name, role: user.role };
}

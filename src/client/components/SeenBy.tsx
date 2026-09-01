import type { SeenUser } from "../../shared/types";

export function SeenBy({ users }: { users: SeenUser[] }) {
  if (users.length === 0) return null;
  return <details className="seen-by">
    <summary aria-label={`みたよ ${users.length}人、一覧を表示`}><span className="seen-eyes" aria-hidden>👀</span><span>{users.length}</span></summary>
    <div className="seen-popover">
      <strong>みたよ</strong>
      <ul>{users.map((user) => <li key={user.id}>{user.displayName}</li>)}</ul>
    </div>
  </details>;
}

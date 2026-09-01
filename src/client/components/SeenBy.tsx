import type { SeenUser } from "../../shared/types";
import { SeenIcon } from "./SeenIcon";

export function SeenBy({ users }: { users: SeenUser[] }) {
  if (users.length === 0) return null;
  return <details className="seen-by">
    <summary aria-label={`みたよ ${users.length}人、一覧を表示`}><SeenIcon /><span>{users.length}</span></summary>
    <div className="seen-popover">
      <strong>みたよ</strong>
      <ul>{users.map((user) => <li key={user.id}>
        <span className="seen-user-avatar" aria-hidden>{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}</span>
        <span>{user.displayName}</span>
      </li>)}</ul>
    </div>
  </details>;
}

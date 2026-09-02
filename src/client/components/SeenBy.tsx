import type { SeenUser } from "../../shared/types";
import { SeenIcon } from "./SeenIcon";

export function SeenBy({ users }: { users: SeenUser[] }) {
  if (users.length === 0)
    return (
      <span className="seen-by-empty" aria-label="見た人 0人">
        <SeenIcon />
        <span>0</span>
      </span>
    );
  return (
    <details className="seen-by">
      <summary aria-label={`見た人 ${users.length}人、一覧を表示`}>
        <SeenIcon />
        <span>{users.length}</span>
      </summary>
      <div className="seen-popover">
        <strong>見た人</strong>
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <span className="seen-user-avatar" aria-hidden>
                {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}
              </span>
              <span>{user.displayName}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

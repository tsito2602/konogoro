import { api } from "./api";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** アイコンの右上の数を、まだ見ていない思い出の数に合わせる。使えない端末では何もしない。 */
export function setAppBadge(count: number): void {
  const nav = navigator as BadgeNavigator;
  if (!nav.setAppBadge) return;
  const done = count > 0 ? nav.setAppBadge(count) : (nav.clearAppBadge?.() ?? nav.setAppBadge(0));
  void done.catch(() => undefined);
}

/** サーバーに数を聞いて合わせ直す。見終わってアプリを閉じたときにも呼ぶ。 */
export function syncAppBadge(): void {
  if (!(navigator as BadgeNavigator).setAppBadge) return;
  void api<{ unreadCount: number }>("/unread-count")
    .then(({ unreadCount }) => setAppBadge(unreadCount))
    .catch(() => undefined);
}

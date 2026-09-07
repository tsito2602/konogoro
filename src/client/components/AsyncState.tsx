import { CircleAlert, Image, LogIn, MessageCircle, Search, Users } from "lucide-react";

export function Loading() {
  return (
    <div className="state-message loading-state" role="status">
      <span className="loading-label">
        <span className="spinner" aria-hidden />
        読み込み中
      </span>
    </div>
  );
}

export function loginUrl(returnTo?: string): string {
  const destination =
    returnTo ??
    (typeof window === "undefined"
      ? "/"
      : `${window.location.pathname}${window.location.search}${window.location.hash}`);
  return destination === "/" ? "/api/auth/line" : `/api/auth/line?returnTo=${encodeURIComponent(destination)}`;
}

export function ErrorState({ message, retry, returnTo }: { message: string; retry?: () => void; returnTo?: string }) {
  const loginRequired = message === "ログインが必要です";
  return (
    <div className="state-message error-state" role="alert">
      <span className="state-symbol" aria-hidden>
        {loginRequired ? <LogIn /> : <CircleAlert />}
      </span>
      <p>{message}</p>
      {loginRequired ? (
        <a className="line-login-button" href={loginUrl(returnTo)}>
          LINEでログイン
        </a>
      ) : (
        retry && (
          <button className="outline-button" type="button" onClick={retry}>
            再読み込み
          </button>
        )
      )}
    </div>
  );
}

const stateIcons = { photos: Image, search: Search, people: Users, activity: MessageCircle };

export function EmptyState({
  title,
  body,
  action,
  kind = "photos",
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  kind?: keyof typeof stateIcons;
}) {
  const Icon = stateIcons[kind];
  return (
    <div className="empty-state">
      <span className={`empty-state-art ${kind}`} aria-hidden>
        <Icon />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

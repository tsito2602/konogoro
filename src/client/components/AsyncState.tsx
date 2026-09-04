export function Loading() {
  return (
    <div className="state-message" role="status">
      <span className="spinner" />
      読み込み中
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
    <div className="state-message error-state">
      <p>{message}</p>
      {loginRequired ? (
        <a className="line-login-button" href={loginUrl(returnTo)}>
          LINEでログイン
        </a>
      ) : (
        retry && (
          <button className="outline-button" onClick={retry}>
            再読み込み
          </button>
        )
      )}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

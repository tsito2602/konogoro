import { useMeasuredHeight } from "../hooks/useMeasuredHeight";
import { Bell, CalendarDays, GalleryVerticalEnd, Images, Plus, Settings } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useOutlet, useOutletContext } from "react-router-dom";
import type { CurrentUser } from "../../shared/types";
import { canCreatePost, canInviteFamily, canManageEvent } from "../../shared/permissions";
import { ReadingPosition, setReadingIdentity } from "../reading-context";
import { api } from "../api";
import { ErrorState } from "./AsyncState";
import { PwaGuide } from "./PwaGuide";
import { WelcomePhotos } from "./WelcomePhotos";
import { AddMenu } from "./AddMenu";
import { ToastProvider } from "./Toast";

export const mainNavigationItems = [
  { to: "/", label: "タイムライン", description: "未閲覧の思い出と全投稿を見る", icon: Images, end: true },
  { to: "/activity", label: "お知らせ", description: "新しい投稿やコメントの履歴を見る", icon: Bell },
  { to: "/events", label: "イベント", description: "旅行やお出かけごとに思い出を見る", icon: CalendarDays },
  { to: "/album", label: "アルバム", description: "写真と動画を撮影時期から探す", icon: GalleryVerticalEnd },
  { to: "/settings", label: "設定", description: "表示や通知などを変更する", icon: Settings },
] as const;

const viewerPattern = /^\/posts\/[^/]+\/media\//;
export function outletKey(pathname: string, locationKey: string): string {
  return viewerPattern.test(pathname) ? "media-viewer" : locationKey;
}

export function canAccessPath(user: CurrentUser, pathname: string): boolean {
  if (/^\/posts\/(new|[^/]+\/edit)$/.test(pathname)) return canCreatePost(user);
  if (/^\/events\/new$/.test(pathname) || /^\/events\/[^/]+\/edit$/.test(pathname)) return canManageEvent(user);
  if (pathname === "/settings/family") return canInviteFamily(user);
  return true;
}

export function postCreatePath(pathname: string): string {
  const eventMatch = pathname.match(/^\/events\/([^/]+)$/);
  return eventMatch ? `/posts/new?event=${encodeURIComponent(eventMatch[1])}` : "/posts/new";
}

export function useCurrentUser(): CurrentUser {
  return useOutletContext<CurrentUser>();
}

export function AppLayout() {
  const navigationHeightRef = useMeasuredHeight("--bottom-nav-height");
  const location = useLocation();
  const { pathname } = location;
  const invite = pathname.startsWith("/invite/");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const outlet = useOutlet(currentUser);
  const routedContent = (
    <Fragment key={`${outletKey(pathname, location.key)}:${currentUser?.id}:${currentUser?.role}`}>{outlet}</Fragment>
  );
  const postPageNavigation = Boolean((location.state as { postPage?: boolean } | null)?.postPage);
  const showPostPage = /^\/posts\/[^/]+$/.test(pathname) && postPageNavigation;
  const sessionIdentity = `${currentUser?.id ?? ""}:${currentUser?.role ?? ""}`;
  const routeIdentity = `${location.key}:${sessionIdentity}`;
  const [backgroundSnapshot, setBackgroundSnapshot] = useState(() => ({
    routeIdentity,
    sessionIdentity,
    content: routedContent,
  }));
  let backgroundContent = backgroundSnapshot.sessionIdentity === sessionIdentity ? backgroundSnapshot.content : null;
  if (!postPageNavigation && backgroundSnapshot.routeIdentity !== routeIdentity) {
    backgroundContent = routedContent;
    setBackgroundSnapshot({ routeIdentity, sessionIdentity, content: routedContent });
  }
  const hideNavigation = viewerPattern.test(pathname);
  const addPostPath = postCreatePath(pathname);
  const hideAddButton =
    /^\/posts\/[^/]+$/.test(pathname) ||
    pathname === "/posts/new" ||
    /^\/posts\/[^/]+\/edit$/.test(pathname) ||
    pathname === "/events/new" ||
    /^\/events\/[^/]+\/edit$/.test(pathname);

  const loadAuth = useCallback(() => {
    void api<CurrentUser>("/me")
      .then((user) => {
        setReadingIdentity(`${user.id}:${user.role}`);
        setAuthError("");
        setCurrentUser(user);
        setAuthenticated(true);
      })
      .catch((reason: Error) => {
        if (reason.message === "ログインが必要です") {
          setAuthError("");
          setReadingIdentity(null);
          setAuthenticated(false);
        } else setAuthError(reason.message);
      });
  }, []);

  useEffect(() => {
    if (invite) return;
    loadAuth();
    const resumeAuth = () => {
      if (document.visibilityState === "visible") loadAuth();
    };
    document.addEventListener("visibilitychange", resumeAuth);
    return () => document.removeEventListener("visibilitychange", resumeAuth);
  }, [invite, loadAuth]);

  if (invite) return <div className="app-shell">{routedContent}</div>;
  if (authenticated === null && !authError) return <BootScreen />;
  if (authError)
    return (
      <div className="app-shell">
        <ErrorState message={authError} retry={loadAuth} />
      </div>
    );
  if (!authenticated) return <LoginScreen returnTo={`${location.pathname}${location.search}${location.hash}`} />;
  if (!currentUser) return <BootScreen />;
  if (!canAccessPath(currentUser, pathname)) return <Navigate to="/" replace />;

  return (
    <ToastProvider>
      <ReadingPosition key={`${currentUser.id}:${currentUser.role}`} />
      <div className={hideNavigation ? "app-shell viewer-shell" : "app-shell"}>
        {showPostPage && backgroundContent ? backgroundContent : routedContent}
        {showPostPage && backgroundContent ? routedContent : null}
        <PwaGuide user={currentUser} />
        {!hideNavigation && (
          <nav
            ref={navigationHeightRef}
            className={`tab-bar${canCreatePost(currentUser) ? " has-desktop-add" : ""}`}
            aria-label="メインナビゲーション"
          >
            {canCreatePost(currentUser) && (
              <div className="desktop-add-slot">
                {canManageEvent(currentUser) ? (
                  <button
                    className={`desktop-add-button${addMenuOpen ? " open" : ""}`}
                    type="button"
                    onClick={() => setAddMenuOpen((open) => !open)}
                    aria-expanded={addMenuOpen}
                    aria-label={addMenuOpen ? "追加メニューを閉じる" : "追加メニューを開く"}
                  >
                    <Plus />
                    <span>
                      <strong>追加</strong>
                      <small>写真・動画・イベント</small>
                    </span>
                  </button>
                ) : (
                  <Link className="desktop-add-button" to={addPostPath} aria-label="写真・動画を追加">
                    <Plus />
                    <span>
                      <strong>追加</strong>
                      <small>写真・動画を投稿</small>
                    </span>
                  </Link>
                )}
              </div>
            )}
            {mainNavigationItems.map(({ icon: Icon, ...item }) => (
              <NavItem {...item} icon={<Icon />} key={item.to} />
            ))}
          </nav>
        )}
        {!hideNavigation && canCreatePost(currentUser) && canManageEvent(currentUser) && addMenuOpen && (
          <AddMenu postPath={addPostPath} close={() => setAddMenuOpen(false)} />
        )}
        {!hideNavigation &&
          !hideAddButton &&
          canCreatePost(currentUser) &&
          (canManageEvent(currentUser) ? (
            <button
              className={`floating-add-button mobile-add-button${addMenuOpen ? " open" : ""}`}
              type="button"
              onClick={() => setAddMenuOpen((open) => !open)}
              aria-expanded={addMenuOpen}
              aria-label={addMenuOpen ? "追加メニューを閉じる" : "追加メニューを開く"}
            >
              <Plus />
              <span className="floating-add-label">追加</span>
            </button>
          ) : (
            <Link className="floating-add-button mobile-add-button" to={addPostPath} aria-label="写真・動画を追加">
              <Plus />
              <span className="floating-add-label">追加</span>
            </Link>
          ))}
      </div>
    </ToastProvider>
  );
}

export function BootScreen() {
  return (
    <main className="boot-screen" role="status" aria-label="このごろを読み込み中">
      <div className="boot-brand">
        <img className="boot-symbol boot-symbol-light" src="/icons/icon-light-transparent.png" alt="" />
        <img className="boot-symbol boot-symbol-dark" src="/icons/icon-dark-transparent.png" alt="" />
        <strong className="boot-name">このごろ</strong>
        <p className="boot-status">読み込み中…</p>
      </div>
    </main>
  );
}

export function LoginScreen({ returnTo = "/" }: { returnTo?: string }) {
  const loginUrl = returnTo === "/" ? "/api/auth/line" : `/api/auth/line?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="login-page">
      <section>
        <WelcomePhotos />
        <span className="login-icon-frame" aria-hidden>
          <img className="login-icon login-icon-light" src="/icons/icon-light-transparent.png" alt="" />
          <img className="login-icon login-icon-dark" src="/icons/icon-dark-transparent.png" alt="" />
        </span>
        <p className="login-eyebrow">このごろ</p>
        <h1>
          日々のひとこまを、
          <br />
          おすそわけ。
        </h1>
        <p>「この頃、何してるかな。」ふと気になる日々の様子が、招待された家族にだけ、そっと届きます。</p>
        <a className="line-login-button" href={loginUrl}>
          LINEでログイン
        </a>
      </section>
    </main>
  );
}

function NavItem({
  to,
  label,
  description,
  icon,
  end,
}: {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={() => window.scrollTo(0, 0)}
      className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}
      aria-label={`${label}：${description}`}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

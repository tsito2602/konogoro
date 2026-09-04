import { Bell, CalendarDays, CalendarPlus, GalleryVerticalEnd, ImagePlus, Images, Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useOutlet, useOutletContext } from "react-router-dom";
import type { CurrentUser } from "../../shared/types";
import { canCreatePost, canInviteFamily, canManageEvent } from "../../shared/permissions";
import { api } from "../api";
import { ErrorState } from "./AsyncState";
import { PwaGuide } from "./PwaGuide";
import { ToastProvider } from "./Toast";

export const mainNavigationItems = [
  { to: "/", label: "タイムライン", description: "未閲覧の思い出と全投稿を見る", icon: Images, end: true },
  { to: "/activity", label: "お知らせ", description: "新しい投稿やコメントの履歴を見る", icon: Bell },
  { to: "/events", label: "イベント", description: "旅行やお出かけごとに思い出を見る", icon: CalendarDays },
  { to: "/album", label: "アルバム", description: "写真と動画を撮影時期から探す", icon: GalleryVerticalEnd },
  { to: "/settings", label: "設定", description: "表示や通知などを変更する", icon: Settings },
] as const;

const viewerPattern = /^\/posts\/[^/]+\/media\//;
export function canAccessPath(user: CurrentUser, pathname: string): boolean {
  if (/^\/posts\/(new|[^/]+\/edit)$/.test(pathname)) return canCreatePost(user);
  if (/^\/events\/new$/.test(pathname) || /^\/events\/[^/]+\/edit$/.test(pathname)) return canManageEvent(user);
  if (pathname === "/settings/family") return canInviteFamily(user);
  return true;
}

export function useCurrentUser(): CurrentUser {
  return useOutletContext<CurrentUser>();
}

export function AppLayout() {
  const location = useLocation();
  const { pathname } = location;
  const invite = pathname.startsWith("/invite/");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const routedContent = useOutlet(currentUser);
  const postPageNavigation = Boolean((location.state as { postPage?: boolean } | null)?.postPage);
  const showPostPage = /^\/posts\/[^/]+$/.test(pathname) && postPageNavigation;
  const routeIdentity = `${location.key}:${currentUser?.id ?? ""}`;
  const [backgroundSnapshot, setBackgroundSnapshot] = useState(() => ({ routeIdentity, content: routedContent }));
  let backgroundContent = backgroundSnapshot.content;
  if (!postPageNavigation && backgroundSnapshot.routeIdentity !== routeIdentity) {
    backgroundContent = routedContent;
    setBackgroundSnapshot({ routeIdentity, content: routedContent });
  }
  const hideNavigation = viewerPattern.test(pathname);
  const hideAddButton =
    /^\/posts\/[^/]+$/.test(pathname) ||
    pathname === "/posts/new" ||
    /^\/posts\/[^/]+\/edit$/.test(pathname) ||
    pathname === "/events/new" ||
    /^\/events\/[^/]+\/edit$/.test(pathname);

  const loadAuth = useCallback(() => {
    void api<CurrentUser>("/me")
      .then((user) => {
        setAuthError("");
        setCurrentUser(user);
        setAuthenticated(true);
      })
      .catch((reason: Error) => {
        if (reason.message === "ログインが必要です") {
          setAuthError("");
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
      <div className={hideNavigation ? "app-shell viewer-shell" : "app-shell"}>
        {showPostPage && backgroundContent ? backgroundContent : routedContent}
        {showPostPage && backgroundContent ? routedContent : null}
        <PwaGuide user={currentUser} />
        {!hideNavigation && (
          <nav className="tab-bar" aria-label="メインナビゲーション">
            {mainNavigationItems.map(({ icon: Icon, ...item }) => (
              <NavItem {...item} icon={<Icon />} key={item.to} />
            ))}
          </nav>
        )}
        {!hideNavigation &&
          !hideAddButton &&
          canCreatePost(currentUser) &&
          (canManageEvent(currentUser) ? (
            <>
              {addMenuOpen && (
                <>
                  <button
                    className="add-menu-backdrop"
                    type="button"
                    onClick={() => setAddMenuOpen(false)}
                    aria-label="追加メニューを閉じる"
                  />
                  <div className="add-menu" role="menu" aria-label="追加するものを選択">
                    <Link to="/posts/new" role="menuitem" onClick={() => setAddMenuOpen(false)}>
                      <ImagePlus />
                      <span>
                        <strong>写真・動画</strong>
                        <small>思い出を投稿する</small>
                      </span>
                    </Link>
                    <Link to="/events/new" role="menuitem" onClick={() => setAddMenuOpen(false)}>
                      <CalendarPlus />
                      <span>
                        <strong>イベント</strong>
                        <small>旅行やお出かけを作る</small>
                      </span>
                    </Link>
                  </div>
                </>
              )}
              <button
                className={`floating-add-button${addMenuOpen ? " open" : ""}`}
                type="button"
                onClick={() => setAddMenuOpen((open) => !open)}
                aria-expanded={addMenuOpen}
                aria-label={addMenuOpen ? "追加メニューを閉じる" : "追加メニューを開く"}
              >
                <Plus />
              </button>
            </>
          ) : (
            <Link className="floating-add-button" to="/posts/new" aria-label="写真・動画を追加">
              <Plus />
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
        <span className="login-icon-frame" aria-hidden>
          <img className="login-icon login-icon-light" src="/icons/icon-light-transparent.png" alt="" />
          <img className="login-icon login-icon-dark" src="/icons/icon-dark-transparent.png" alt="" />
        </span>
        <p className="login-eyebrow">このごろ</p>
        <h1>メンバーの思い出を、ひとつの場所に</h1>
        <p>写真や動画を招待したメンバーだけで共有できます。</p>
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

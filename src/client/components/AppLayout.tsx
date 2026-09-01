import { CalendarDays, CalendarPlus, House, ImagePlus, Plus, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useOutletContext } from "react-router-dom";
import type { CurrentUser } from "../../shared/types";
import { canCreatePost, canInviteFamily, canManageEvent } from "../../shared/permissions";
import { api } from "../api";
import { ErrorState, Loading } from "./AsyncState";

const viewerPattern = /^\/posts\/[^/]+\/media\//;
const postDetailPattern = /^\/posts\/[^/]+$/;
export function canAccessPath(user: CurrentUser, pathname: string): boolean {
  if (/^\/posts\/new$/.test(pathname)) return canCreatePost(user);
  if (/^\/events\/new$/.test(pathname) || /^\/events\/[^/]+\/edit$/.test(pathname)) return canManageEvent(user);
  if (/^\/family$/.test(pathname)) return canInviteFamily(user);
  return true;
}

export function useCurrentUser(): CurrentUser {
  return useOutletContext<CurrentUser>();
}

export function AppLayout() {
  const { pathname } = useLocation();
  const invite = pathname.startsWith("/invite/");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const hideNavigation = viewerPattern.test(pathname) || (pathname !== "/posts/new" && postDetailPattern.test(pathname));
  const hideAddButton = pathname === "/posts/new" || pathname === "/events/new" || /^\/events\/[^/]+\/edit$/.test(pathname);

  const loadAuth = () => {
    setAuthenticated(null);
    setAuthError("");
    void api<CurrentUser>("/me")
      .then((user) => { setCurrentUser(user); setAuthenticated(true); })
      .catch((reason: Error) => {
        if (reason.message === "ログインが必要です") setAuthenticated(false);
        else setAuthError(reason.message);
      });
  };

  useEffect(() => {
    if (!invite) void api<CurrentUser>("/me")
      .then((user) => { setCurrentUser(user); setAuthenticated(true); })
      .catch((reason: Error) => {
        if (reason.message === "ログインが必要です") setAuthenticated(false);
        else setAuthError(reason.message);
      });
  }, [invite]);

  if (invite) return <div className="app-shell"><Outlet /></div>;
  if (authenticated === null && !authError) return <div className="app-shell"><Loading /></div>;
  if (authError) return <div className="app-shell"><ErrorState message={authError} retry={loadAuth} /></div>;
  if (!authenticated) return <LoginScreen />;
  if (!currentUser) return <div className="app-shell"><Loading /></div>;
  if (!canAccessPath(currentUser, pathname)) return <Navigate to="/" replace />;

  return (
    <div className={hideNavigation ? "app-shell viewer-shell" : "app-shell"}>
      <Outlet context={currentUser} />
      {!hideNavigation && (
        <nav className="tab-bar" aria-label="メインナビゲーション">
          <NavItem to="/" label="タイムライン" icon={<House />} end />
          <NavItem to="/events" label="イベント" icon={<CalendarDays />} />
          {canInviteFamily(currentUser)
            ? <NavItem to="/family" label="家族" icon={<Users />} />
            : <NavItem to="/settings" label="設定" icon={<Settings />} />}
        </nav>
      )}
      {!hideNavigation && !hideAddButton && canCreatePost(currentUser) && (canManageEvent(currentUser) ? <>
        {addMenuOpen && <><button className="add-menu-backdrop" type="button" onClick={() => setAddMenuOpen(false)} aria-label="追加メニューを閉じる" /><div className="add-menu" role="menu" aria-label="追加するものを選択">
          <Link to="/posts/new" role="menuitem" onClick={() => setAddMenuOpen(false)}><ImagePlus /><span><strong>写真・動画</strong><small>思い出を投稿する</small></span></Link>
          <Link to="/events/new" role="menuitem" onClick={() => setAddMenuOpen(false)}><CalendarPlus /><span><strong>イベント</strong><small>旅行やお出かけを作る</small></span></Link>
        </div></>}
        <button className={`floating-add-button${addMenuOpen ? " open" : ""}`} type="button" onClick={() => setAddMenuOpen((open) => !open)} aria-expanded={addMenuOpen} aria-label={addMenuOpen ? "追加メニューを閉じる" : "追加メニューを開く"}><Plus /></button>
      </> : <Link className="floating-add-button" to="/posts/new" aria-label="写真・動画を追加"><Plus /></Link>)}
    </div>
  );
}

export function LoginScreen() {
  return <main className="login-page"><section>
    <img className="login-icon" src="/icons/icon-light-192.png" alt="" />
    <p className="login-eyebrow">このごろ</p>
    <h1>家族の思い出を、ひとつの場所に</h1>
    <p>写真や動画を家族だけで共有できます。</p>
    <a className="line-login-button" href="/api/auth/line">LINEでログイン</a>
  </section></main>;
}

function NavItem({ to, label, icon, end }: { to: string; label: string; icon: React.ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

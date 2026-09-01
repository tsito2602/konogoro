import { CalendarDays, House, Plus, Settings, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useOutletContext } from "react-router-dom";
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
  const hideNavigation = viewerPattern.test(pathname) || (pathname !== "/posts/new" && postDetailPattern.test(pathname));

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
          {canCreatePost(currentUser) && <NavItem to="/posts/new" label="追加" icon={<Plus />} prominent />}
          {canInviteFamily(currentUser)
            ? <NavItem to="/family" label="家族" icon={<Users />} />
            : <NavItem to="/settings" label="設定" icon={<Settings />} />}
        </nav>
      )}
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

function NavItem({ to, label, icon, end, prominent }: { to: string; label: string; icon: React.ReactNode; end?: boolean; prominent?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab-item${isActive ? " active" : ""}${prominent ? " add-tab" : ""}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

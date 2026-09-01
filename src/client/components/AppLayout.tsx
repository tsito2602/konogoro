import { CalendarDays, House, Plus, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const viewerPattern = /^\/posts\/[^/]+\/media\//;
const postDetailPattern = /^\/posts\/[^/]+$/;

export function AppLayout() {
  const { pathname } = useLocation();
  const hideNavigation = viewerPattern.test(pathname) || (pathname !== "/posts/new" && postDetailPattern.test(pathname));

  return (
    <div className={hideNavigation ? "app-shell viewer-shell" : "app-shell"}>
      <Outlet />
      {!hideNavigation && (
        <nav className="tab-bar" aria-label="メインナビゲーション">
          <NavItem to="/" label="タイムライン" icon={<House />} end />
          <NavItem to="/events" label="イベント" icon={<CalendarDays />} />
          <NavItem to="/posts/new" label="追加" icon={<Plus />} prominent />
          <NavItem to="/family" label="家族" icon={<Users />} />
        </nav>
      )}
    </div>
  );
}

function NavItem({ to, label, icon, end, prominent }: { to: string; label: string; icon: React.ReactNode; end?: boolean; prominent?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab-item${isActive ? " active" : ""}${prominent ? " add-tab" : ""}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

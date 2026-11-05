import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CurrentUser } from "../../shared/types";
import { canManageEvent } from "../../shared/permissions";
import { DockBackIcon, DockGroup } from "../cartoon/cartoon-dock";
import { canReturnInApp } from "../reading-context";
import { useMeasuredHeight } from "../hooks/useMeasuredHeight";
import { MainDock, type MainDockItem } from "./MainDock";

/* タブ（タイムライン・お知らせ・イベント・アルバム・設定）のボトムナビは一番上の階層だけに出す。
   それ以外の画面では、その画面に合った操作のボトムナビへ形を変える（Tsubasa 2026-11-04）。 */
const TOP_LEVEL = new Set(["/", "/timeline", "/activity", "/events", "/album", "/settings"]);

/** Pages that render their own dock (their controls need the page's form state). */
const OWN_DOCK = [/^\/posts\/(?!new$)[^/]+(\/edit)?$/, /^\/posts\/new$/, /^\/events\/new$/, /^\/events\/[^/]+\/edit$/];

export const isTopLevel = (pathname: string) => TOP_LEVEL.has(pathname);
export const hasOwnDock = (pathname: string) => OWN_DOCK.some((pattern) => pattern.test(pathname));

/** The page one level up, for a back button opened without in-app history. */
function parentOf(pathname: string) {
  if (pathname.startsWith("/settings/")) return "/settings";
  if (pathname.startsWith("/events/")) return "/events";
  return "/";
}

/** A page's own controls in place of the tabs (null: the tabs).
    The post page closes back into the same controls, so the dock does not change twice. */
export function contextDock(pathname: string, user: CurrentUser): { identity: string; controls: ReactNode } | null {
  if (isTopLevel(pathname)) return null;
  const event = pathname.match(/^\/events\/([^/]+)$/);
  if (event && event[1] !== "new")
    return {
      identity: `event:${event[1]}`,
      controls: (
        <>
          <BackGroup fallback="/events" />
          {canManageEvent(user) && (
            <DockGroup slot="r">
              <Link to={`/events/${event[1]}/edit`} state={{ returnToDetail: true }} aria-label="イベントを編集">
                <Pencil />
              </Link>
            </DockGroup>
          )}
        </>
      ),
    };
  // ほかの画面（新しい思い出、メンバーの管理など）は戻るだけ。
  return { identity: `back:${pathname}`, controls: <BackGroup fallback={parentOf(pathname)} /> };
}

export function BackGroup({ fallback, onBack }: { fallback?: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <DockGroup slot="l">
      <button
        type="button"
        aria-label="戻る"
        onClick={() => {
          if (onBack) onBack();
          else if (canReturnInApp()) navigate(-1);
          else navigate(fallback ?? "/", { replace: true });
        }}
      >
        <DockBackIcon />
      </button>
    </DockGroup>
  );
}

/** The dock of a page that has its own controls: back on the left, the page's actions after it. */
export function PageDock({
  items,
  identity,
  label,
  fallback,
  onBack,
  children,
}: {
  items: readonly MainDockItem[];
  identity: string;
  label: string;
  fallback?: string;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const heightRef = useMeasuredHeight("--bottom-nav-height");
  return (
    <MainDock measureRef={heightRef} items={items} className="page-dock" identity={identity} label={label}>
      <BackGroup fallback={fallback} onBack={onBack} />
      {children}
    </MainDock>
  );
}

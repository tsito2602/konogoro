import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CurrentUser } from "../../shared/types";
import { canManageEvent } from "../../shared/permissions";
import { DockBackIcon, DockGroup } from "../cartoon/cartoon-dock";
import { canReturnInApp } from "../reading-context";

/** A page's own controls in place of the tabs (null: the tabs).
    The post page closes back into the same controls, so the dock does not change twice. */
export function contextDock(pathname: string, user: CurrentUser): { identity: string; controls: ReactNode } | null {
  const event = pathname.match(/^\/events\/([^/]+)$/);
  if (event && event[1] !== "new")
    return {
      identity: `event:${event[1]}`,
      controls: <EventDetailControls eventId={event[1]} canEdit={canManageEvent(user)} />,
    };
  return null;
}

/** イベント詳細：左＝戻る、右＝編集（Tsubasa 2026-11-04「イベント詳細も、ボトムナビに戻ると編集を」）。 */
function EventDetailControls({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const navigate = useNavigate();
  return (
    <>
      <DockGroup slot="l">
        <button
          type="button"
          aria-label="戻る"
          onClick={() => (canReturnInApp() ? navigate(-1) : navigate("/events", { replace: true }))}
        >
          <DockBackIcon />
        </button>
      </DockGroup>
      {canEdit && (
        <DockGroup slot="r">
          <Link to={`/events/${eventId}/edit`} state={{ returnToDetail: true }} aria-label="イベントを編集">
            <Pencil />
          </Link>
        </DockGroup>
      )}
    </>
  );
}

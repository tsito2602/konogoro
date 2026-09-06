import { useMeasuredHeight } from "../hooks/useMeasuredHeight";
import { canReturnInApp } from "../reading-context";
import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export function PageHeader({
  title,
  action,
  back = false,
  inverse = false,
}: {
  title: string;
  action?: React.ReactNode;
  back?: boolean;
  inverse?: boolean;
}) {
  const heightRef = useMeasuredHeight("--page-header-height");
  const navigate = useNavigate();
  const location = useLocation();
  const backPath = location.pathname.startsWith("/events/") ? "/events" : "/";
  return (
    <header ref={heightRef} className={`page-header${inverse ? " inverse" : ""}`}>
      <div className="page-header-inner">
        <div className="header-side">
          {back && (
            <button
              className="icon-button"
              type="button"
              onClick={() => (canReturnInApp() ? navigate(-1) : navigate(backPath, { replace: true }))}
              aria-label="戻る"
            >
              <ChevronLeft />
            </button>
          )}
        </div>
        {title ? <h1>{title}</h1> : <span aria-hidden />}
        <div className="header-side header-action">{action}</div>
      </div>
    </header>
  );
}

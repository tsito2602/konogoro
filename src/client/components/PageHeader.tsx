import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  return (
    <header className={`page-header${inverse ? " inverse" : ""}`}>
      <div className="header-side">
        {back && (
          <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="戻る">
            <ChevronLeft />
          </button>
        )}
      </div>
      {title ? <h1>{title}</h1> : <span aria-hidden />}
      <div className="header-side header-action">{action}</div>
    </header>
  );
}

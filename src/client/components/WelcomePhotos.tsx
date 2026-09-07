import { useState } from "react";

export function WelcomePhotos() {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      className={`welcome-photos${expanded ? " expanded" : ""}`}
      type="button"
      aria-label="サンプル写真を広げる"
      aria-pressed={expanded}
      onClick={() => setExpanded((value) => !value)}
    >
      <img className="welcome-photo-back" src="/demo/forest.jpg" alt="" width="240" height="180" />
      <img className="welcome-photo-front" src="/demo/lake.jpg" alt="" width="240" height="180" />
      <span>写真にふれてみる</span>
    </button>
  );
}

type SkeletonVariant =
  | "app"
  | "timeline"
  | "activity"
  | "events"
  | "album"
  | "event-detail"
  | "post-detail"
  | "form"
  | "settings"
  | "members"
  | "viewer";

export function PageSkeleton({
  variant,
  showActivityViewers = true,
}: {
  variant: SkeletonVariant;
  showActivityViewers?: boolean;
}) {
  return (
    <div className={`page-skeleton ${variant}`} role="status" aria-busy="true">
      <span className="visually-hidden">読み込み中</span>
      <div aria-hidden>{skeletonContent(variant, showActivityViewers)}</div>
    </div>
  );
}

export function CommentComposerSkeleton() {
  return (
    <div className="comment-composer skeleton-comment-composer" role="status" aria-busy="true">
      <span className="visually-hidden">コメント欄を読み込み中</span>
      <div className="skeleton-circle" aria-hidden />
      <div className="skeleton-line" aria-hidden />
      <div className="skeleton-circle" aria-hidden />
    </div>
  );
}

function skeletonContent(variant: SkeletonVariant, showActivityViewers: boolean) {
  if (variant === "timeline")
    return (
      <>
        {postSkeleton("large")} {postSkeleton("compact")}
      </>
    );
  if (variant === "activity")
    return (
      <>
        {showActivityViewers && (
          <div className="skeleton-viewers">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index}>
                <span className="skeleton-circle" />
                <span className="skeleton-line short" />
              </div>
            ))}
          </div>
        )}
        <div className="skeleton-rows">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-circle" />
              <span>
                <i className="skeleton-line" />
                <i className="skeleton-line medium" />
              </span>
              <i className="skeleton-square" />
            </div>
          ))}
        </div>
      </>
    );
  if (variant === "events")
    return (
      <div className="skeleton-event-list">
        <span className="skeleton-line short skeleton-event-section-title" />
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-event-card" key={index}>
            <span className="skeleton-line short" />
            <span className="skeleton-line medium" />
            <span className="skeleton-line wide" />
          </div>
        ))}
      </div>
    );
  if (variant === "album")
    return (
      <>
        <div className="skeleton-album-picker">
          <span className="skeleton-line medium" />
          <span className="skeleton-line wide" />
        </div>
        <div className="skeleton-album-cover" />
        <div className="skeleton-album-grid">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </>
    );
  if (variant === "event-detail")
    return (
      <>
        <div className="skeleton-event-cover" />
        {postSkeleton("compact")}
      </>
    );
  if (variant === "post-detail")
    return (
      <>
        <div className="skeleton-post-head">
          <span className="skeleton-circle" />
          <span>
            <i className="skeleton-line medium" />
            <i className="skeleton-line short" />
          </span>
        </div>
        <div className="skeleton-post-media" />
        <div className="skeleton-post-copy">
          <span className="skeleton-line medium" />
          <span className="skeleton-line wide" />
        </div>
        <div className="skeleton-comments">
          <span className="skeleton-line short" />
          <div className="skeleton-row">
            <span className="skeleton-circle" />
            <span>
              <i className="skeleton-line medium" />
              <i className="skeleton-line wide" />
            </span>
          </div>
        </div>
      </>
    );
  if (variant === "viewer")
    return (
      <>
        <div className="skeleton-viewer-media" />
        <div className="skeleton-viewer-copy">
          <span className="skeleton-line medium" />
          <span className="skeleton-line wide" />
        </div>
        <div className="skeleton-viewer-strip">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </>
    );
  if (variant === "members")
    return (
      <div className="skeleton-form-page">
        <span className="skeleton-line short" />
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-member" key={index}>
            <span className="skeleton-circle" />
            <span>
              <i className="skeleton-line medium" />
              <i className="skeleton-line short" />
            </span>
          </div>
        ))}
        <span className="skeleton-line short" />
        <div className="skeleton-field tall" />
      </div>
    );
  if (variant === "form" || variant === "settings")
    return (
      <div className="skeleton-form-page">
        {Array.from({ length: variant === "settings" ? 4 : 3 }, (_, index) => (
          <div className="skeleton-form-group" key={index}>
            <span className="skeleton-line short" />
            <div className={`skeleton-field${index === 1 ? " tall" : ""}`} />
          </div>
        ))}
      </div>
    );
  return (
    <div className="skeleton-app">
      <span className="skeleton-circle" />
      <span className="skeleton-line medium" />
      <span className="skeleton-line wide" />
    </div>
  );
}

function postSkeleton(size: "large" | "compact") {
  return (
    <div className={`skeleton-post ${size}`}>
      <div className="skeleton-post-head">
        <span className="skeleton-circle" />
        <span>
          <i className="skeleton-line medium" />
          <i className="skeleton-line short" />
        </span>
      </div>
      <div className="skeleton-post-media" />
      <div className="skeleton-post-copy">
        <span className="skeleton-line medium" />
        <span className="skeleton-line wide" />
      </div>
    </div>
  );
}

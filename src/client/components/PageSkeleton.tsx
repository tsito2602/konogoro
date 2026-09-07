import type { CurrentUser } from "../../shared/types";
import { canInviteFamily, canViewMemberLastViewed } from "../../shared/permissions";

export type SkeletonVariant =
  | "app"
  | "timeline"
  | "unread"
  | "activity"
  | "events"
  | "album"
  | "event-detail"
  | "post-detail"
  | "event-edit"
  | "post-edit"
  | "settings"
  | "members"
  | "viewer";

type SkeletonProps = { variant: SkeletonVariant; currentUser?: CurrentUser; previewUrls?: string[] };

export function PageSkeleton({ variant, currentUser, previewUrls }: SkeletonProps) {
  return (
    <div className={`page-skeleton skeleton-${variant}`} role="status" aria-busy="true">
      <span className="visually-hidden">読み込み中</span>
      <div className="skeleton-content" aria-hidden>
        {skeletonContent(variant, currentUser, previewUrls)}
      </div>
    </div>
  );
}

const line = (size = "wide") => <span className={`skeleton-line ${size}`} />;
const tiles = (count: number) => Array.from({ length: count }, (_, i) => <span className="skeleton-tile" key={i} />);

export function AlbumContentSkeleton({ allYear = false }: { allYear?: boolean }) {
  return (
    <div className="page-skeleton" role="status" aria-busy="true">
      <span className="visually-hidden">写真・動画を読み込み中</span>
      <section className="album-month" aria-hidden>
        {!allYear && <div className="album-cover skeleton-tile" />}
        <div className="album-grid skeleton-album-grid">{tiles(9)}</div>
      </section>
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

export function UnreadSummarySkeleton() {
  return (
    <div className="unread-summary skeleton-unread-summary" role="status" aria-busy="true">
      <span className="visually-hidden">新着件数を読み込み中</span>
      <div aria-hidden>
        {line("short")}
        {line()}
      </div>
      <span className="skeleton-field" aria-hidden />
    </div>
  );
}

function postSkeleton(showContext = true) {
  return (
    <div className="post-card skeleton-post">
      <div className="post-head">
        <div className="post-author-row">
          <span className="post-author-avatar skeleton-circle" />
          {line("short")}
        </div>
        {showContext && <div className="post-context">{line("medium")}</div>}
      </div>
      <div className="media-grid skeleton-media-grid" data-count="4">
        {tiles(4)}
      </div>
      <div className="post-copy">
        {line()}
        <div className="post-engagement">
          {line("short")}
          {line("short")}
        </div>
      </div>
    </div>
  );
}

function field(tall = false) {
  return (
    <div className="skeleton-form-group">
      {line("short")}
      <div className={`skeleton-field${tall ? " tall" : ""}`} />
    </div>
  );
}
function memberRows(count = 3) {
  return Array.from({ length: count }, (_, i) => (
    <div className="member-row" key={i}>
      <span className="member-avatar skeleton-circle" />
      <div className="member-copy skeleton-copy">
        {line("medium")}
        {line("short")}
      </div>
    </div>
  ));
}
function settingsSection(content: React.ReactNode, className = "") {
  return (
    <section className={`settings-section ${className}`}>
      <h2>{line("short")}</h2>
      <div className="settings-card skeleton-settings-card">{content}</div>
    </section>
  );
}
function menuRows(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <div className="settings-menu-row" key={i}>
      <span className="skeleton-square" />
      <div className="skeleton-copy">
        {line("medium")}
        {line("short")}
      </div>
    </div>
  ));
}
function roleChoices() {
  return (
    <div className="role-guide skeleton-role-guide">
      {Array.from({ length: 3 }, (_, i) => (
        <div className="skeleton-role-choice" key={i}>
          <span className="skeleton-circle" />
          <div className="skeleton-copy">
            {line("short")}
            {line()}
          </div>
        </div>
      ))}
    </div>
  );
}

function skeletonContent(variant: SkeletonVariant, currentUser?: CurrentUser, previewUrls?: string[]): React.ReactNode {
  switch (variant) {
    case "timeline":
      return (
        <>
          <div className="timeline-month-heading">{line("short")}</div>
          {postSkeleton()}
          {postSkeleton()}
        </>
      );
    case "unread":
      return postSkeleton();
    case "activity":
      return (
        <>
          {currentUser && canViewMemberLastViewed(currentUser) && (
            <section className="member-last-viewed skeleton-viewers">
              <h2>{line("short")}</h2>
              <div className="member-last-viewed-list">
                {Array.from({ length: 5 }, (_, i) => (
                  <div className="member-last-viewed-item" key={i}>
                    <span className="member-last-viewed-avatar skeleton-circle" />
                    <strong>{line()}</strong>
                    <time>{line()}</time>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="activity-list skeleton-rows">
            {Array.from({ length: 5 }, (_, i) => (
              <div className="activity-row" key={i}>
                <span className="activity-icon skeleton-circle" />
                <span className="activity-copy skeleton-copy">
                  {line()}
                  {line("medium")}
                  {line("short")}
                </span>
                <span className="skeleton-activity-thumbnail skeleton-tile" />
              </div>
            ))}
          </div>
        </>
      );
    case "events":
      return (
        <section className="event-list-section">
          <h2 className="event-list-section-title">{line("short")}</h2>
          {Array.from({ length: 4 }, (_, i) => (
            <div className="event-card" key={i}>
              <div className="event-card-image skeleton-tile" />
              <div className="event-card-copy skeleton-copy">
                {line("medium")}
                <div className="event-card-meta">
                  {line("short")}
                  {line("short")}
                </div>
              </div>
            </div>
          ))}
        </section>
      );
    case "album":
      return (
        <>
          <div className="album-picker-header">
            <div className="album-year-picker skeleton-year-picker">
              <span className="skeleton-square" />
              {line("short")}
              <span className="skeleton-square" />
            </div>
            <div className="album-month-picker skeleton-month-picker">{tiles(5)}</div>
          </div>
          <section className="album-month">
            <div className="album-cover skeleton-tile" />
            <div className="album-grid skeleton-album-grid">{tiles(9)}</div>
          </section>
        </>
      );
    case "event-detail":
      return (
        <div className="event-detail">
          <section className="event-cover skeleton-tile">
            <div className="event-cover-copy skeleton-copy">
              {line("short")}
              {line("wide")}
            </div>
          </section>
          <section className="event-post-feed">
            <div className="event-detail-counts">{line("medium")}</div>
            {postSkeleton(false)}
          </section>
        </div>
      );
    case "post-detail":
      return (
        <div className="post-detail">
          <div className="post-detail-head">
            <div className="post-author-row">
              <span className="post-author-avatar skeleton-circle" />
              {line("short")}
            </div>
            {line("medium")}
          </div>
          <div className="detail-media-grid media-grid skeleton-media-grid" data-count={previewUrls?.length || 4}>
            {previewUrls?.length
              ? previewUrls.map((url, index) => (
                  <div className="media-cell" key={index}>
                    <img src={url} alt="" />
                  </div>
                ))
              : tiles(4)}
          </div>
          <div className="post-detail-copy skeleton-copy">
            {line()}
            {line("medium")}
          </div>
          <section className="conversation skeleton-copy">
            <h2>{line("short")}</h2>
            {memberRows(1)}
            {line()}
          </section>
        </div>
      );
    case "event-edit":
      return (
        <div className="form-page page-content event-edit">
          <div className="form-stack">
            {field()}
            <div className="date-row">
              {field()}
              {field()}
            </div>
            {field(true)}
          </div>
          <section className="management-section skeleton-copy">
            <div className="management-heading scene-management-heading">
              <h2>{line("short")}</h2>
              <span className="skeleton-tile" style={{ width: 64, height: 44 }} />
            </div>
            {/* 取得前には件数不明の見出し行や編集時の操作を作らない。 */}
            <div className="skeleton-field" />
          </section>
          <section className="management-section skeleton-copy">
            {line("short")}
            <div className="cover-grid">{tiles(6)}</div>
            <div className="skeleton-field tall" />
          </section>
          <section className="management-section danger-zone skeleton-copy">
            {line("short")}
            {line()}
            <div className="skeleton-field" />
          </section>
        </div>
      );
    case "post-edit":
      return (
        <div className="form-page page-content">
          <div className="form-stack post-edit-form">
            <section className="photo-picker">
              <div className="selected-photos">{tiles(5)}</div>
              <div className="media-reorder-hint">
                <div className="skeleton-line" />
              </div>
            </section>
            {field()}
            {/* 見出しはイベント選択の取得後に表示するため、取得前には行を作らない。 */}
            {field(true)}
            <div className="skeleton-field" />
          </div>
        </div>
      );
    case "settings":
      return (
        <div className="settings-page skeleton-settings-layout">
          <div className="settings-form">
            {settingsSection(field())}
            {settingsSection(
              <>
                <div className="notification-toggle">
                  <span className="notification-toggle-icon skeleton-tile" />
                  <div className="notification-toggle-copy skeleton-copy">
                    {line("medium")}
                    {line()}
                  </div>
                  <span className="notification-switch skeleton-tile" />
                </div>
                <div className="setting-status">{line("medium")}</div>
                <div className="setting-status">{line("medium")}</div>
              </>,
            )}
          </div>
          {currentUser?.isStaging && settingsSection(roleChoices(), "skeleton-staging-section")}
          {settingsSection(<div className="skeleton-theme-options">{tiles(3)}</div>)}
          {settingsSection(menuRows(2))}
          {currentUser &&
            canInviteFamily(currentUser) &&
            settingsSection(
              <>
                {memberRows()}
                {menuRows(1)}
              </>,
              "skeleton-family-section",
            )}
          {settingsSection(menuRows(1))}
          <div className="settings-app-info">
            <span className="skeleton-tile" />
            <strong>{line("short")}</strong>
            <small>{line("short")}</small>
          </div>
        </div>
      );
    case "members":
      return (
        <div className="family-page skeleton-family-layout">
          <section className="family-section">
            <h2>{line("short")}</h2>
            <div className="member-list">{memberRows(4)}</div>
          </section>
          <section className="family-section invite-section skeleton-copy">
            <h2>{line("short")}</h2>
            {line()}
            {roleChoices()}
            <div className="skeleton-field" />
          </section>
        </div>
      );
    case "viewer":
      return (
        <>
          <div className="viewer-stage skeleton-tile" />
          <div className="viewer-info skeleton-copy">
            {line("medium")}
            {line("short")}
            <div className="viewer-controls skeleton-viewer-navigation">{tiles(2)}</div>
            <div className="skeleton-field skeleton-viewer-comment" />
          </div>
          <div className="thumbnail-strip skeleton-viewer-strip">{tiles(5)}</div>
        </>
      );
    default:
      return (
        <div className="skeleton-app">
          <span className="skeleton-circle" />
          {line("medium")}
          {line()}
        </div>
      );
  }
}

import { CalendarDays, Camera, ChevronRight, MessageCircle, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { useSeenTracking } from "../hooks/useSeenTracking";
import { SeenBy } from "./SeenBy";

export function PostCard({ post, showContext = true }: { post: Post; showContext?: boolean }) {
  const { ref: seenRef, viewed } = useSeenTracking(post.id, post.viewedByCurrentUser);
  const latestComment = post.comments.at(-1);
  const contextTitle = showContext ? (post.eventTitle ?? "日常の投稿") : "投稿";
  const contextSubtitle = showContext ? post.sceneTitle : null;
  const date = post.capturedAt ?? post.publishedAt;
  const dateLabel = post.capturedAt ? "撮影日" : "投稿日";
  return (
    <article className="post-card" ref={seenRef}>
      <Link className="post-head" to={`/posts/${post.id}`} aria-label={`${post.authorName}さんの投稿を開く`}>
        <span className="post-author-avatar" aria-hidden>
          {post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt="" /> : post.authorName.slice(0, 1)}
        </span>
        <span className="post-head-copy">
          <strong className="post-event-title">
            {showContext && post.eventTitle && <CalendarDays aria-hidden />}
            {contextTitle}
          </strong>
          {contextSubtitle && <span>{contextSubtitle}</span>}
        </span>
        <ChevronRight aria-hidden />
      </Link>
      <Link
        to={`/posts/${post.id}`}
        className={`media-grid${viewed ? "" : " unseen"}`}
        data-count={Math.min(post.media.length, 4)}
        aria-label={`${viewed ? "" : "未閲覧の"}投稿を開く`}
      >
        {post.media.slice(0, 4).map((media, index) => (
          <div className="media-cell" key={media.id}>
            <img src={media.thumbnailUrl} alt="" loading="lazy" />
            {media.kind === "video" && (
              <span className="media-play-mark" aria-hidden>
                ▶
              </span>
            )}
            {index === 3 && post.media.length >= 4 && <span className="more-count">+{post.media.length - 3}</span>}
          </div>
        ))}
      </Link>
      <div className="post-copy">
        <div className="post-engagement">
          <SeenBy users={post.seenBy} />
          <Link
            className="comment-count-link"
            to={`/posts/${post.id}`}
            aria-label={`コメント${post.comments.length}件を開く`}
          >
            <MessageCircle aria-hidden />
            <span>{post.comments.length}</span>
          </Link>
          <time className="post-date" dateTime={date ?? undefined} aria-label={`${dateLabel} ${formatPostDate(date)}`}>
            {post.capturedAt ? <Camera aria-hidden /> : <Upload aria-hidden />}
            <span>{formatPostDate(date)}</span>
          </time>
        </div>
        {post.caption && (
          <Link className="post-caption" to={`/posts/${post.id}`} aria-label="投稿の詳細を開く">
            {post.caption}
          </Link>
        )}
        {latestComment && (
          <div className="post-comment-section">
            <Link
              className="post-comment-preview"
              to={`/posts/${post.id}`}
              aria-label={`${latestComment.authorName}さんのコメントを開く`}
            >
              <span className="post-comment-avatar" aria-hidden>
                {latestComment.avatarUrl ? (
                  <img src={latestComment.avatarUrl} alt="" />
                ) : (
                  latestComment.authorName.slice(0, 1)
                )}
              </span>
              <span>
                <strong>{latestComment.authorName}</strong>
                <span>{latestComment.body}</span>
              </span>
            </Link>
            {post.comments.length > 1 && (
              <Link className="more-comments-link" to={`/posts/${post.id}`}>
                ほかのコメントを見る
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function formatPostDate(value: string | null): string {
  if (!value) return "日付なし";
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(new Date(value));
}

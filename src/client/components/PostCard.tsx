import { CalendarDays, Camera, MessageCircle, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { useSeenTracking } from "../hooks/useSeenTracking";
import { SeenBy } from "./SeenBy";

export function PostCard({ post, showContext = true }: { post: Post; showContext?: boolean }) {
  const postPageState = { postPage: true };
  const mediaViewerState = { returnToPrevious: true };
  const { ref: seenRef, viewed } = useSeenTracking(post.id, post.viewedByCurrentUser);
  const latestComment = post.comments.at(-1);
  const commentLinkLabel = post.comments.length === 0 ? "コメントを書く" : `コメント${post.comments.length}件`;
  const date = post.capturedAt ?? post.publishedAt;
  const dateLabel = post.capturedAt ? "撮影日" : "投稿日";
  return (
    <article className="post-card" ref={seenRef}>
      <Link
        className="post-head"
        to={`/posts/${post.id}`}
        state={postPageState}
        aria-label={`${post.authorName}さんの投稿を開く`}
      >
        <span className="post-author-row">
          <span className="post-author-avatar" aria-hidden>
            {post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt="" /> : post.authorName.slice(0, 1)}
          </span>
          <strong className="post-author-name">{post.authorName}</strong>
        </span>
        {(showContext ? post.eventTitle || post.sceneTitle : post.sceneTitle) && (
          <span className="post-context">
            {showContext && post.eventTitle && (
              <>
                <CalendarDays aria-hidden />
                <span>{post.eventTitle}</span>
              </>
            )}
            {showContext && post.eventTitle && post.sceneTitle && <span aria-hidden>›</span>}
            {post.sceneTitle && <span>{post.sceneTitle}</span>}
          </span>
        )}
      </Link>
      <div className={`media-grid${viewed ? "" : " unseen"}`} data-count={Math.min(post.media.length, 4)}>
        {post.media.slice(0, 4).map((media, index) => (
          <Link
            className="media-cell"
            key={media.id}
            to={`/posts/${post.id}/media/${media.id}`}
            state={mediaViewerState}
            aria-label={`${viewed ? "" : "未閲覧の"}投稿の${media.kind === "video" ? "動画" : "写真"} ${index + 1}/${post.media.length}を開く`}
          >
            <img src={media.thumbnailUrl} alt="" loading="lazy" />
            {media.kind === "video" && (
              <span className="media-play-mark" aria-hidden>
                ▶
              </span>
            )}
            {index === 3 && post.media.length >= 4 && <span className="more-count">+{post.media.length - 3}</span>}
          </Link>
        ))}
      </div>
      <div className="post-copy">
        <div className="post-engagement">
          <SeenBy users={post.seenBy} />
          <Link
            className="comment-count-link"
            to={`/posts/${post.id}`}
            state={postPageState}
            aria-label={post.comments.length === 0 ? commentLinkLabel : `${commentLinkLabel}を開く`}
          >
            <MessageCircle aria-hidden />
            <span>{commentLinkLabel}</span>
          </Link>
          <time className="post-date" dateTime={date ?? undefined} aria-label={`${dateLabel} ${formatPostDate(date)}`}>
            {post.capturedAt ? <Camera aria-hidden /> : <Upload aria-hidden />}
            <span>{formatPostDate(date)}</span>
          </time>
        </div>
        {post.caption && (
          <Link className="post-caption" to={`/posts/${post.id}`} state={postPageState} aria-label="投稿の詳細を開く">
            {post.caption}
          </Link>
        )}
        {latestComment && (
          <div className="post-comment-section">
            <Link
              className="post-comment-preview"
              to={`/posts/${post.id}`}
              state={postPageState}
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
              <Link className="more-comments-link" to={`/posts/${post.id}`} state={postPageState}>
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
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", timeZone: "Asia/Tokyo" }).format(
    new Date(value),
  );
}

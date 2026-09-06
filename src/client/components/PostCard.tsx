import { VideoPreview } from "./VideoPreview";
import { VideoBadge } from "./VideoBadge";
import { commentNavigationState } from "../comment-navigation";
import { CalendarDays, Camera, MessageCircle, Play, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Post } from "../../shared/types";
import { useSeenTracking } from "../hooks/useSeenTracking";
import { SeenBy } from "./SeenBy";

export function PostCard({
  post,
  showContext = true,
  onViewed,
  onViewError,
  trackSeen = true,
}: {
  post: Post;
  showContext?: boolean;
  trackSeen?: boolean;
  onViewed?: () => void;
  onViewError?: (message: string) => void;
}) {
  const navigate = useNavigate();
  const postPageState = { postPage: true };
  const mediaViewerState = { returnToPrevious: true };
  const { ref: seenRef, viewed } = useSeenTracking(
    post.id,
    post.viewedByCurrentUser,
    {
      onViewed,
      onError: onViewError,
    },
    trackSeen,
  );
  const latestComment = post.comments.at(-1);
  const commentCount = post.commentCount ?? post.comments.length;
  const mediaCount = post.mediaCount ?? post.media.length;
  const heroVideo = post.media.find((media) => media.kind === "video");
  const otherMedia = heroVideo ? post.media.filter((media) => media.id !== heroVideo.id) : post.media;
  const commentLinkLabel = commentCount === 0 ? "コメントを書く" : `コメント${commentCount}件`;
  const date = post.capturedAt ?? post.publishedAt;
  const dateLabel = post.capturedAt ? "撮影日" : "投稿日";
  return (
    <article data-reading-item={`post-${post.id}`} className="post-card" ref={seenRef}>
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
      {heroVideo && (
        <Link
          className={`post-video-hero${viewed ? "" : " unseen"}`}
          to={`/posts/${post.id}/media/${heroVideo.id}`}
          state={{ ...mediaViewerState, playVideo: true }}
          aria-label="動画を音付きで見る"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate(`/posts/${post.id}/media/${heroVideo.id}`, {
              state: { ...mediaViewerState, playVideo: true, playRequestedAt: performance.now() },
            });
          }}
        >
          <VideoPreview media={heroVideo} />
          <span className="post-video-action">
            <Play aria-hidden />
            音付きで見る
          </span>
          <VideoBadge durationSeconds={heroVideo.durationSeconds} />
          {mediaCount > 1 && <span className="post-media-total">写真・動画 {mediaCount}件</span>}
        </Link>
      )}
      <div
        className={`media-grid${heroVideo ? " video-companions" : ""}${viewed ? "" : " unseen"}`}
        data-count={Math.min(otherMedia.length, heroVideo ? 3 : 4)}
      >
        {otherMedia.slice(0, heroVideo ? 3 : 4).map((media, index) => (
          <Link
            className="media-cell"
            key={media.id}
            to={`/posts/${post.id}/media/${media.id}`}
            state={{ ...mediaViewerState, playVideo: media.kind === "video" }}
            aria-label={`${viewed ? "" : "未閲覧の"}投稿の${media.kind === "video" ? "動画" : "写真"} ${index + 1}/${mediaCount}を開く`}
          >
            <img src={media.thumbnailUrl} alt="" loading="lazy" />
            {media.kind === "video" && <VideoBadge durationSeconds={media.durationSeconds} />}
            {index === (heroVideo ? 2 : 3) && mediaCount > 4 && <span className="more-count">+{mediaCount - 3}</span>}
          </Link>
        ))}
      </div>
      <div className="post-copy">
        {post.caption && (
          <Link className="post-caption" to={`/posts/${post.id}`} state={postPageState} aria-label="投稿の詳細を開く">
            {post.caption}
          </Link>
        )}
        <div className="post-engagement">
          <Link
            className="comment-count-link"
            to={`/posts/${post.id}`}
            state={commentNavigationState(commentCount === 0 ? "write" : "read")}
            aria-label={commentCount === 0 ? commentLinkLabel : `${commentLinkLabel}を開く`}
          >
            <MessageCircle aria-hidden />
            <span>{commentLinkLabel}</span>
          </Link>
          <SeenBy users={post.seenBy} />
          <time className="post-date" dateTime={date ?? undefined} aria-label={`${dateLabel} ${formatPostDate(date)}`}>
            {post.capturedAt ? <Camera aria-hidden /> : <Upload aria-hidden />}
            <span>{formatPostDate(date)}</span>
          </time>
        </div>
        {latestComment && (
          <div className="post-comment-section">
            <Link
              className="post-comment-preview"
              to={`/posts/${post.id}`}
              state={commentNavigationState("read")}
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
            {commentCount > 1 && (
              <Link className="more-comments-link" to={`/posts/${post.id}`} state={commentNavigationState("read")}>
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

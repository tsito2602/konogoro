import { CalendarDays, ChevronRight, Images } from "lucide-react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { formatDate } from "../api";
import { useSeenTracking } from "../hooks/useSeenTracking";
import { SeenBy } from "./SeenBy";

export function PostCard({ post, showContext = true }: { post: Post; showContext?: boolean }) {
  const { ref: seenRef, viewed } = useSeenTracking(post.id, post.viewedByCurrentUser);
  const latestComment = post.comments.at(-1);
  return (
    <article className="post-card" ref={seenRef}>
      {showContext && post.eventId && post.eventTitle && (
        <Link className="post-context" to={`/events/${post.eventId}`} aria-label={`${post.eventTitle}を開く`}>
          <CalendarDays aria-hidden />
          <span>{post.eventTitle}</span>
          {post.sectionTitle && <><ChevronRight aria-hidden /><span>{post.sectionTitle}</span></>}
        </Link>
      )}
      <Link to={`/posts/${post.id}`} className={`media-grid${viewed ? "" : " unseen"}`} data-count={Math.min(post.media.length, 4)} aria-label={`${viewed ? "" : "未閲覧の"}${post.title}を開く`}>
        {post.media.slice(0, 4).map((media, index) => (
          <div className="media-cell" key={media.id}>
            <img src={media.thumbnailUrl} alt="" loading="lazy" />
            {media.kind === "video" && <span className="media-play-mark" aria-hidden>▶</span>}
            {index === 3 && post.media.length >= 4 && <span className="more-count">+{post.media.length - 3}</span>}
          </div>
        ))}
      </Link>
      <div className="post-copy">
        <div>
          <Link to={`/posts/${post.id}`} className="post-title" aria-label={`${post.title}の詳細を開く`}><span>{post.title}</span><ChevronRight aria-hidden /></Link>
          <p className="post-meta"><Images aria-hidden />{post.authorName} · {mediaSummary(post)} · {formatDate(post.capturedAt)}</p>
        </div>
        {post.caption && <p className="post-caption">{post.caption}</p>}
        {latestComment && <div className="post-comment-section">
          <Link className="post-comment-preview" to={`/posts/${post.id}`} aria-label={`${latestComment.authorName}さんのコメントを開く`}>
            <span className="post-comment-avatar" aria-hidden>{latestComment.avatarUrl ? <img src={latestComment.avatarUrl} alt="" /> : latestComment.authorName.slice(0, 1)}</span>
            <span><strong>{latestComment.authorName}</strong><span>{latestComment.body}</span></span>
          </Link>
          {post.comments.length > 1 && <Link className="more-comments-link" to={`/posts/${post.id}`}>ほかのコメント{post.comments.length - 1}件を見る</Link>}
        </div>}
        <div className="post-social-meta">
          <SeenBy users={post.seenBy} />
        </div>
      </div>
    </article>
  );
}

function mediaSummary(post: Post): string {
  const photos = post.media.filter((media) => media.kind === "image").length;
  const videos = post.media.length - photos;
  return [photos ? `写真${photos}枚` : "", videos ? `動画${videos}本` : ""].filter(Boolean).join("・");
}

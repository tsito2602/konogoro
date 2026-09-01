import { Images } from "lucide-react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { formatDate } from "../api";
import { useSeenTracking } from "../hooks/useSeenTracking";
import { SeenBy } from "./SeenBy";

export function PostCard({ post, showContext = true }: { post: Post; showContext?: boolean }) {
  const seenRef = useSeenTracking(post.id);
  return (
    <article className="post-card" ref={seenRef}>
      {showContext && (post.sectionTitle || post.eventTitle) && (
        <p className="post-context">{post.sectionTitle ?? post.eventTitle}</p>
      )}
      <Link to={`/posts/${post.id}`} className="media-grid" data-count={Math.min(post.media.length, 4)} aria-label={`${post.title}を開く`}>
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
          <Link to={`/posts/${post.id}`} className="post-title">{post.title}</Link>
          <p className="post-meta"><Images aria-hidden />{post.authorName} · {mediaSummary(post)} · {formatDate(post.capturedAt)}</p>
        </div>
        {post.caption && <p className="post-caption">{post.caption}</p>}
        <div className="post-social-meta">
          {post.comments.length > 0 && <span>コメント{post.comments.length}件</span>}
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

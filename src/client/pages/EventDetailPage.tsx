import { Pencil } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { EventDetail } from "../../shared/types";
import { api, eventDate } from "../api";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { PostCard } from "../components/PostCard";
import { useCurrentUser } from "../components/AppLayout";
import { canCreatePost, canManageEvent } from "../../shared/permissions";

export function EventDetailPage() {
  const currentUser = useCurrentUser();
  const canAddPost = canCreatePost(currentUser);
  const { eventId = "" } = useParams();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState("");
  const coverImageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [eventId]);
  const load = () => {
    setError("");
    void api<EventDetail>(`/events/${eventId}`)
      .then(setDetail)
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<EventDetail>(`/events/${eventId}`)
      .then(setDetail)
      .catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  useEffect(() => {
    const coverImage = coverImageRef.current;
    if (!coverImage) return;
    let animationFrame = 0;
    const updateScale = () => {
      animationFrame = 0;
      const scrollProgress = Math.min(Math.max(window.scrollY, 0), 400) / 400;
      const scale = 1 + scrollProgress * 0.08;
      coverImage.style.setProperty("--event-cover-scale", scale.toFixed(3));
      coverImage.style.setProperty("--event-cover-blur", `${(scrollProgress * 5).toFixed(2)}px`);
    };
    const handleScroll = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateScale);
    };
    updateScale();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [detail?.coverUrl]);
  if (!detail && !error)
    return (
      <>
        <PageHeader title="イベント" back />
        <PageSkeleton variant="event-detail" />
      </>
    );
  if (error)
    return (
      <>
        <PageHeader title="イベント" back />
        <ErrorState message={error} retry={load} />
      </>
    );
  if (!detail) return null;
  const description = detail.description.trim();
  return (
    <>
      <PageHeader
        title={detail.title}
        back
        action={
          canManageEvent(currentUser) ? (
            <Link
              className="icon-button"
              to={`/events/${detail.id}/edit`}
              state={{ returnToDetail: true }}
              aria-label="イベントを編集"
            >
              <Pencil />
            </Link>
          ) : undefined
        }
      />
      <main className="event-detail">
        <section className={`event-cover${detail.coverUrl ? "" : " no-cover"}`}>
          {detail.coverUrl && (
            <div
              ref={coverImageRef}
              className="event-cover-image"
              style={{ backgroundImage: `url(${detail.coverUrl})` }}
              aria-hidden
            />
          )}
          <div className="event-cover-copy">
            <p>{eventDate(detail.startDate, detail.endDate)}</p>
            <h2>{detail.title}</h2>
            <span>{eventCounts(detail.postCount, detail.photoCount, detail.videoCount)}</span>
          </div>
        </section>
        <section className="event-post-feed" aria-label="イベントの投稿">
          {description && (
            <section className="event-memo" aria-labelledby="event-memo-title">
              <h3 id="event-memo-title">メモ</h3>
              <p>{description}</p>
            </section>
          )}
          {detail.posts.length === 0 && (
            <EmptyState
              title="まだ投稿がありません"
              body={canAddPost ? "このイベントの写真を追加できます。" : "投稿が追加されると、ここに表示されます。"}
              action={
                canAddPost ? (
                  <Link className="primary-button" to={`/posts/new?event=${detail.id}`}>
                    写真を追加
                  </Link>
                ) : undefined
              }
            />
          )}
          {detail.posts.map((post) => (
            <PostCard key={post.id} post={post} showContext={false} />
          ))}
        </section>
      </main>
    </>
  );
}

function eventCounts(posts: number, photos: number, videos: number): string {
  return [`投稿${posts}件`, photos ? `写真${photos}枚` : "", videos ? `動画${videos}本` : ""]
    .filter(Boolean)
    .join(" · ");
}

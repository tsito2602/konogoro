import { useReadingState } from "../reading-context";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useViewTransitionState } from "react-router-dom";
import type { EventDetail, EventSummary } from "../../shared/types";
import { api, eventDate } from "../api";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton, EventPostsSkeleton } from "../components/PageSkeleton";
import { PostCard } from "../components/PostCard";
import { useCurrentUser } from "../components/AppLayout";
import "../event-material.css";
import { canCreatePost, canManageEvent } from "../../shared/permissions";

export function EventDetailPage() {
  const currentUser = useCurrentUser();
  const canAddPost = canCreatePost(currentUser);
  const { eventId = "" } = useParams();
  const location = useLocation();
  const transitioning = useViewTransitionState("/events");
  const preview = (location.state as { eventPreview?: EventSummary } | null)?.eventPreview;
  const [detail, setDetail] = useReadingState<EventDetail | null>("detail", null);
  const [error, setError] = useState("");
  const cover = detail ?? (preview?.id === eventId ? preview : null);
  const coverImageRef = useRef<HTMLDivElement>(null);
  const load = () => {
    setError("");
    void api<EventDetail>(`/events/${eventId}`)
      .then(setDetail)
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    const controller = new AbortController();
    void api<EventDetail>(`/events/${eventId}`, { signal: controller.signal })
      .then(setDetail)
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [eventId, setDetail]);
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
  }, [cover?.coverUrl]);
  if (!cover && !error)
    return (
      <>
        <PageHeader
          title="イベント"
          back
          action={canManageEvent(currentUser) ? <span className="skeleton-square" aria-hidden /> : undefined}
        />
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
  if (!cover) return null;
  const description = detail?.description.trim();
  return (
    <>
      <PageHeader
        title={cover.title}
        back
        action={
          detail && canManageEvent(currentUser) ? (
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
        <section
          className={`event-cover${cover.coverUrl ? "" : " no-cover"}`}
          style={{ viewTransitionName: transitioning ? "event-surface" : undefined }}
        >
          {cover.coverUrl && (
            <div
              ref={coverImageRef}
              className="event-cover-image"
              style={{
                backgroundImage: `url(${cover.coverUrl})`,
                backgroundPosition: `${cover.coverPosition?.x ?? 50}% ${cover.coverPosition?.y ?? 50}%`,
              }}
              aria-hidden
            />
          )}
          <div className="event-cover-copy">
            <p>{eventDate(cover.startDate, cover.endDate)}</p>
            <h2 style={{ viewTransitionName: transitioning ? "event-title" : undefined }}>{cover.title}</h2>
          </div>
        </section>
        <section className="event-post-feed" aria-label="イベントの投稿">
          {!detail && <EventPostsSkeleton />}
          {detail && (
            <p className="event-detail-counts">{eventCounts(detail.postCount, detail.photoCount, detail.videoCount)}</p>
          )}
          {description && (
            <section className="event-memo" aria-labelledby="event-memo-title">
              <h3 id="event-memo-title">メモ</h3>
              <p>{description}</p>
            </section>
          )}
          {detail?.posts.length === 0 && (
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
          {detail?.posts.map((post) => (
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

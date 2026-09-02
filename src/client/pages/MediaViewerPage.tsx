import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ErrorState } from "../components/AsyncState";
import { PageSkeleton } from "../components/PageSkeleton";

export function swipeDirection(deltaX: number, deltaY: number): "previous" | "next" | null {
  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return null;
  return deltaX > 0 ? "previous" : "next";
}

export function swipeDragOffset(deltaX: number, canMovePrevious: boolean, canMoveNext: boolean) {
  const reachedEdge = (deltaX > 0 && !canMovePrevious) || (deltaX < 0 && !canMoveNext);
  return deltaX * (reachedEdge ? 0.24 : 0.88);
}

export function MediaViewerPage() {
  const { postId = "", mediaId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeAnimation = useRef<number | null>(null);
  const load = () => {
    setError("");
    void api<Post>(`/posts/${postId}`)
      .then(setPost)
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<Post>(`/posts/${postId}`)
      .then(setPost)
      .catch((reason: Error) => setError(reason.message));
  }, [postId]);
  useEffect(
    () => () => {
      if (swipeAnimation.current !== null) window.clearTimeout(swipeAnimation.current);
    },
    [],
  );
  const index = post?.media.findIndex((item) => item.id === mediaId) ?? -1;
  const current = post?.media[index];
  const closeViewer = useCallback(() => {
    if (location.state?.returnToPrevious) navigate(-1);
    else navigate(`/posts/${postId}`, { replace: true });
  }, [location.state?.returnToPrevious, navigate, postId]);
  const showMedia = useCallback(
    (targetIndex: number) => {
      if (!post || targetIndex < 0 || targetIndex >= post.media.length) return;
      navigate(`/posts/${postId}/media/${post.media[targetIndex].id}`, { replace: true, state: location.state });
    },
    [location.state, navigate, post, postId],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!post) return;
      if (event.key === "ArrowLeft") showMedia(index - 1);
      if (event.key === "ArrowRight") showMedia(index + 1);
      if (event.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [closeViewer, index, post, showMedia]);
  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeAnimation.current !== null) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (current?.kind === "video" && event.target instanceof HTMLVideoElement) {
      const bounds = event.target.getBoundingClientRect();
      if (event.clientY >= bounds.bottom - 52) return;
    }
    swipeStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };
  const moveSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 6 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setDragging(true);
    setDragOffset(swipeDragOffset(deltaX, index > 0, index < (post?.media.length ?? 0) - 1));
  };
  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    const targetIndex = direction === "previous" ? index - 1 : direction === "next" ? index + 1 : -1;
    if (direction && post && targetIndex >= 0 && targetIndex < post.media.length) {
      setDragging(false);
      setDragOffset(direction === "previous" ? event.currentTarget.clientWidth : -event.currentTarget.clientWidth);
      swipeAnimation.current = window.setTimeout(() => {
        showMedia(targetIndex);
        setDragOffset(0);
        swipeAnimation.current = null;
      }, 200);
      return;
    }
    setDragging(false);
    setDragOffset(0);
  };
  const cancelSwipe = () => {
    swipeStart.current = null;
    setDragging(false);
    setDragOffset(0);
  };
  if (!post && !error)
    return (
      <div className="media-viewer">
        <PageSkeleton variant="viewer" />
      </div>
    );
  if (error || !post || !current)
    return (
      <div className="media-viewer">
        <ErrorState message={error || "写真が見つかりません"} retry={error ? load : undefined} />
      </div>
    );
  return (
    <main className="media-viewer">
      <header className="viewer-header">
        <button className="viewer-button" type="button" onClick={closeViewer} aria-label="閉じる">
          <X />
        </button>
        <span>
          {index + 1} / {post.media.length}
        </span>
        <a className="viewer-button" href={current.downloadUrl} aria-label="保存">
          <Download />
        </a>
      </header>
      <div
        className="viewer-stage"
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
      >
        {index > 0 && (
          <Link
            className="viewer-arrow previous"
            to={`/posts/${postId}/media/${post.media[index - 1].id}`}
            replace
            state={location.state}
            aria-label="前の写真"
          >
            <ChevronLeft />
          </Link>
        )}
        <div
          key={current.id}
          className={`viewer-media-frame${dragging ? " dragging" : ""}`}
          style={{ transform: `translate3d(${dragOffset}px, 0, 0)` }}
        >
          {current.kind === "video" ? (
            <video src={current.contentUrl} controls playsInline draggable={false} />
          ) : (
            <img src={current.contentUrl} alt={`投稿の写真 ${index + 1}`} draggable={false} />
          )}
        </div>
        {index < post.media.length - 1 && (
          <Link
            className="viewer-arrow next"
            to={`/posts/${postId}/media/${post.media[index + 1].id}`}
            replace
            state={location.state}
            aria-label="次の写真"
          >
            <ChevronRight />
          </Link>
        )}
      </div>
      <div className="viewer-info">
        <strong>{post.caption || "写真・動画"}</strong>
        <span>
          {formatDate(current.capturedAt ?? post.capturedAt)} · {post.authorName}
        </span>
        {(post.eventTitle || post.sceneTitle) && (
          <span>{[post.eventTitle, post.sceneTitle].filter(Boolean).join(" · ")}</span>
        )}
      </div>
      <div className="thumbnail-strip">
        {post.media.map((media) => (
          <Link
            className={media.id === current.id ? "selected" : ""}
            key={media.id}
            to={`/posts/${postId}/media/${media.id}`}
            replace
            state={location.state}
          >
            <img src={media.thumbnailUrl} alt="" />
            {media.kind === "video" && (
              <span className="thumbnail-video-mark" aria-hidden>
                ▶
              </span>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}

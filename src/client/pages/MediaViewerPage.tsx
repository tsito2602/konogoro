import { ChevronLeft, ChevronRight, Download, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { AlbumMedia, Media, Post } from "../../shared/types";
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

export function mediaExitOffset(direction: "previous" | "next", width: number): number {
  return direction === "previous" ? width : -width;
}

type ViewerNavigationItem = Pick<AlbumMedia, "id" | "postId" | "kind" | "thumbnailUrl">;

export function viewerNavigationItems(
  postId: string,
  postMedia: Array<Pick<Media, "id" | "kind" | "thumbnailUrl">>,
  albumMedia?: AlbumMedia[],
): ViewerNavigationItem[] {
  if (albumMedia?.some((item) => item.postId === postId && postMedia.some((media) => media.id === item.id))) {
    return albumMedia;
  }
  return postMedia.map((media) => ({ ...media, postId }));
}

export function viewerCommentNavigation(postId: string, currentState: unknown) {
  const state = currentState && typeof currentState === "object" ? currentState : {};
  return {
    to: `/posts/${postId}`,
    state: { ...state, postPage: true, focusComment: true },
  };
}

export function MediaViewerPage() {
  const { postId = "", mediaId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerState = location.state as { returnToPrevious?: boolean; albumMedia?: AlbumMedia[] } | null;
  const [loadedPost, setLoadedPost] = useState<{ postId: string; post: Post } | null>(null);
  const [error, setError] = useState("");
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeAnimation = useRef<number | null>(null);
  const load = () => {
    setError("");
    void api<Post>(`/posts/${postId}`)
      .then((post) => setLoadedPost({ postId, post }))
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<Post>(`/posts/${postId}`)
      .then((post) => setLoadedPost({ postId, post }))
      .catch((reason: Error) => setError(reason.message));
  }, [postId]);
  useEffect(
    () => () => {
      if (swipeAnimation.current !== null) window.clearTimeout(swipeAnimation.current);
    },
    [],
  );
  const post = loadedPost?.postId === postId ? loadedPost.post : null;
  const current = post?.media.find((item) => item.id === mediaId);
  const navigationItems = useMemo(
    () => (post ? viewerNavigationItems(postId, post.media, viewerState?.albumMedia) : []),
    [post, postId, viewerState?.albumMedia],
  );
  const index = navigationItems.findIndex((item) => item.id === mediaId && item.postId === postId);
  const closeViewer = useCallback(() => {
    if (viewerState?.returnToPrevious) navigate(-1);
    else navigate(`/posts/${postId}`, { replace: true });
  }, [navigate, postId, viewerState?.returnToPrevious]);
  const showMedia = useCallback(
    (targetIndex: number) => {
      const target = navigationItems[targetIndex];
      if (!target) return;
      navigate(`/posts/${target.postId}/media/${target.id}`, { replace: true, state: location.state });
    },
    [location.state, navigate, navigationItems],
  );
  const animateToMedia = useCallback(
    (targetIndex: number, direction: "previous" | "next") => {
      if (targetIndex < 0 || targetIndex >= navigationItems.length || swipeAnimation.current !== null) return;
      setDragging(false);
      setDragOffset(mediaExitOffset(direction, stageRef.current?.clientWidth ?? window.innerWidth));
      swipeAnimation.current = window.setTimeout(() => {
        showMedia(targetIndex);
        setDragOffset(0);
        swipeAnimation.current = null;
      }, 200);
    },
    [navigationItems.length, showMedia],
  );
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!post) return;
      if (event.key === "ArrowLeft") animateToMedia(index - 1, "previous");
      if (event.key === "ArrowRight") animateToMedia(index + 1, "next");
      if (event.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [animateToMedia, closeViewer, index, post]);
  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeAnimation.current !== null) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (current?.kind === "video" && event.target instanceof HTMLVideoElement) return;
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
    setDragOffset(swipeDragOffset(deltaX, index > 0, index < navigationItems.length - 1));
  };
  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    const targetIndex = direction === "previous" ? index - 1 : direction === "next" ? index + 1 : -1;
    if (direction && targetIndex >= 0 && targetIndex < navigationItems.length) {
      animateToMedia(targetIndex, direction);
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
  const commentNavigation = viewerCommentNavigation(postId, location.state);
  return (
    <main className="media-viewer">
      <header className="viewer-header">
        <button className="viewer-button" type="button" onClick={closeViewer} aria-label="閉じる">
          <X />
        </button>
        <span>
          {index + 1} / {navigationItems.length}
        </span>
        <a className="viewer-button" href={current.downloadUrl} aria-label="保存">
          <Download />
        </a>
      </header>
      <div
        ref={stageRef}
        className="viewer-stage"
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
      >
        {index > 0 && (
          <Link
            className="viewer-arrow previous"
            to={`/posts/${navigationItems[index - 1].postId}/media/${navigationItems[index - 1].id}`}
            replace
            state={location.state}
            aria-label="前の写真"
            onClick={(event) => {
              event.preventDefault();
              animateToMedia(index - 1, "previous");
            }}
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
            <video src={current.contentUrl} controls playsInline preload="metadata" draggable={false} />
          ) : (
            <img src={current.contentUrl} alt={`投稿の写真 ${index + 1}`} draggable={false} />
          )}
        </div>
        {index < navigationItems.length - 1 && (
          <Link
            className="viewer-arrow next"
            to={`/posts/${navigationItems[index + 1].postId}/media/${navigationItems[index + 1].id}`}
            replace
            state={location.state}
            aria-label="次の写真"
            onClick={(event) => {
              event.preventDefault();
              animateToMedia(index + 1, "next");
            }}
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
        <Link
          className="outline-button"
          to={commentNavigation.to}
          state={commentNavigation.state}
          style={{
            alignSelf: "flex-start",
            marginTop: 7,
            gap: 7,
            color: "white",
            borderColor: "rgba(255, 255, 255, 0.62)",
          }}
        >
          <MessageCircle aria-hidden />
          この投稿にコメント
        </Link>
      </div>
      <div className="thumbnail-strip">
        {navigationItems.map((media) => (
          <Link
            className={media.id === current.id ? "selected" : ""}
            key={media.id}
            to={`/posts/${media.postId}/media/${media.id}`}
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

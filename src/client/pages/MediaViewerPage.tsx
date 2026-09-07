import { ViewerComments } from "../components/ViewerComments";
import { clearPreparedVideo, prepareNextVideo, useVideoPreparation } from "../video-experience";
import { VideoPlayer } from "../components/VideoPlayer";
import { commentNavigationState } from "../comment-navigation";
import { canReturnInApp, rememberAlbumMedia, updateReadingPost } from "../reading-context";
import { ChevronLeft, ChevronRight, Download, MessageCircle, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { AlbumMedia, Media, Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ViewerImage } from "../components/ViewerImage";
import { ErrorState, Loading } from "../components/AsyncState";

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
  currentMediaId?: string,
): ViewerNavigationItem[] {
  if (
    albumMedia?.some(
      (item) =>
        item.postId === postId &&
        (currentMediaId ? item.id === currentMediaId : postMedia.some((media) => media.id === item.id)),
    )
  ) {
    return albumMedia;
  }
  return postMedia.map((media) => ({ ...media, postId }));
}

export function viewerCommentNavigation(postId: string, currentState: unknown) {
  return {
    to: `/posts/${postId}`,
    state: commentNavigationState("write", currentState),
  };
}

export function MediaViewerPage() {
  const { postId = "", mediaId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewerState = location.state as {
    returnToPrevious?: boolean;
    albumMedia?: AlbumMedia[];
    albumOrigin?: string;
    playVideo?: boolean;
    playRequestedAt?: number;
  } | null;
  useEffect(() => {
    rememberAlbumMedia(
      viewerState?.albumOrigin,
      mediaId,
      viewerState?.albumMedia?.findIndex((item) => item.id === mediaId),
    );
  }, [mediaId, viewerState?.albumOrigin, viewerState?.albumMedia]);
  const [loadedPost, setLoadedPost] = useState<{ postId: string; post: Post } | null>(null);
  const [failure, setFailure] = useState<{ postId: string; message: string } | null>(null);
  const error = failure?.postId === postId ? failure.message : "";
  const [retry, setRetry] = useState(0);
  const postCache = useRef(new Map<string, Post>());
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [finishedMedia, setFinishedMedia] = useState<string | null>(null);
  const [playingMedia, setPlayingMedia] = useState<string | null>(null);
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const canPrepare = useVideoPreparation();
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeAnimation = useRef<number | null>(null);
  const load = () => {
    setFailure(null);
    postCache.current.delete(postId);
    setRetry((value) => value + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    const cached = postCache.current.get(postId);
    const request = cached ? Promise.resolve(cached) : api<Post>(`/posts/${postId}`, { signal: controller.signal });
    void request
      .then((post) => {
        if (controller.signal.aborted) return;
        postCache.current.set(postId, post);
        setFailure(null);
        setLoadedPost({ postId, post });
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setFailure({ postId, message: reason.message });
      });
    return () => controller.abort();
  }, [postId, retry]);
  useEffect(
    () => () => {
      if (swipeAnimation.current !== null) window.clearTimeout(swipeAnimation.current);
      swipeAnimation.current = null;
    },
    [postId, mediaId],
  );
  const post = loadedPost?.postId === postId ? loadedPost.post : null;
  const current = post?.media.find((item) => item.id === mediaId);
  const navigationItems = useMemo(
    () =>
      post
        ? viewerNavigationItems(postId, post.media, viewerState?.albumMedia, mediaId)
        : (viewerState?.albumMedia ?? []),
    [post, postId, viewerState?.albumMedia, mediaId],
  );
  const index = navigationItems.findIndex((item) => item.id === mediaId && item.postId === postId);
  useLayoutEffect(() => {
    const strip = thumbnailStripRef.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !selected) return;
    const stripBounds = strip.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    // Scroll this strip only; scrollIntoView could also move the page or viewer.
    strip.scrollLeft = Math.max(
      0,
      Math.min(
        strip.scrollWidth - strip.clientWidth,
        strip.scrollLeft +
          selectedBounds.left -
          stripBounds.left -
          strip.clientLeft +
          selectedBounds.width / 2 -
          strip.clientWidth / 2,
      ),
    );
  }, [current?.id, postId, navigationItems.length]);

  useEffect(() => {
    const next = navigationItems[index + 1];
    if (!canPrepare || commentsOpen) {
      clearPreparedVideo();
      return;
    }
    if (playingMedia !== mediaId || next?.kind !== "video") return;
    let cleanup: (() => void) | undefined;
    const controller = new AbortController();
    const prepare = (nextPost: Post) => {
      if (controller.signal.aborted) return;
      const media = nextPost.media.find((item) => item.id === next.id);
      if (media) cleanup = prepareNextVideo(media);
    };
    if (next.postId === postId && post) prepare(post);
    else
      void api<Post>(`/posts/${next.postId}`, { signal: controller.signal })
        .then(prepare)
        .catch(() => {});
    return () => {
      controller.abort();
      cleanup?.();
    };
  }, [canPrepare, commentsOpen, playingMedia, mediaId, navigationItems, index, postId, post]);
  const closeViewer = useCallback(() => {
    clearPreparedVideo();
    if (viewerState?.returnToPrevious && canReturnInApp()) navigate(-1);
    else navigate(`/posts/${postId}`, { replace: true });
  }, [navigate, postId, viewerState?.returnToPrevious]);
  const showMedia = useCallback(
    (targetIndex: number) => {
      const target = navigationItems[targetIndex];
      if (!target) return;
      if (swipeAnimation.current !== null) {
        window.clearTimeout(swipeAnimation.current);
        swipeAnimation.current = null;
      }
      setDragOffset(0);
      setDragging(false);
      setCommentsOpen(false);
      navigate(`/posts/${target.postId}/media/${target.id}`, {
        replace: true,
        state: {
          ...(location.state as object | null),
          playVideo: target.kind === "video",
          playRequestedAt: performance.now(),
        },
      });
    },
    [location.state, navigate, navigationItems],
  );
  const animateToMedia = useCallback(
    (targetIndex: number, direction: "previous" | "next") => {
      if (targetIndex < 0 || targetIndex >= navigationItems.length || swipeAnimation.current !== null) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        showMedia(targetIndex);
        return;
      }
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
      if (event.key === "Escape") {
        if (commentsOpen) {
          setCommentsOpen(false);
          commentButtonRef.current?.focus();
        } else closeViewer();
        return;
      }
      if (
        !post ||
        commentsOpen ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, button, video, [contenteditable]"))
      )
        return;
      if (event.key === "ArrowLeft") animateToMedia(index - 1, "previous");
      if (event.key === "ArrowRight") animateToMedia(index + 1, "next");
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [animateToMedia, closeViewer, commentsOpen, index, post]);
  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeAnimation.current !== null) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (event.target instanceof Element && event.target.closest("video, button, a")) return;
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
  return (
    <main className={`media-viewer video-viewer${commentsOpen ? " comments-open" : ""}`}>
      <header className="viewer-header">
        <button className="viewer-button" type="button" onClick={closeViewer} aria-label="閉じる">
          <X />
        </button>
        <span>{navigationItems.length ? `${index + 1} / ${navigationItems.length}` : "読み込み中"}</span>
        <a className="viewer-button" href={current?.downloadUrl} aria-disabled={!current} aria-label="保存">
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
        <div
          key={current?.id ?? `${postId}/${mediaId}`}
          className={`viewer-media-frame${dragging ? " dragging" : ""}`}
          style={{ transform: `translate3d(${dragOffset}px, 0, 0)` }}
        >
          {error || (post && !current) ? (
            <ErrorState message={error || "写真が見つかりません"} retry={error ? load : undefined} />
          ) : !current ? (
            <Loading />
          ) : current.kind === "video" ? (
            <VideoPlayer
              key={current.id}
              src={current.contentUrl}
              poster={current.thumbnailUrl}
              mediaId={current.id}
              autoPlay={viewerState?.playVideo === true}
              requestedAt={viewerState?.playRequestedAt}
              paused={commentsOpen}
              onPlaybackStarted={() => {
                setFinishedMedia(null);
              }}
              onNearEnd={() => setPlayingMedia(current.id)}
              onEnded={() => {
                setFinishedMedia(current.id);
              }}
            />
          ) : (
            <ViewerImage src={current.contentUrl} alt={`投稿の写真 ${index + 1}`} />
          )}
        </div>
      </div>
      <div className="viewer-info">
        <strong>{post?.caption || "写真・動画"}</strong>
        <span>
          {post && current ? `${formatDate(current.capturedAt ?? post.capturedAt)} · ${post.authorName}` : ""}
        </span>
        {post && (post.eventTitle || post.sceneTitle) && (
          <span>{[post.eventTitle, post.sceneTitle].filter(Boolean).join(" · ")}</span>
        )}
        <div className="viewer-controls">
          <button
            type="button"
            onClick={() => animateToMedia(index - 1, "previous")}
            disabled={index <= 0}
            aria-label="前の写真・動画"
          >
            <ChevronLeft aria-hidden />
            前へ
          </button>
          <button
            type="button"
            onClick={() => animateToMedia(index + 1, "next")}
            disabled={index >= navigationItems.length - 1}
            aria-label="次の写真・動画"
          >
            次へ
            <ChevronRight aria-hidden />
          </button>
        </div>
        {current && finishedMedia === current.id && (
          <p className="viewer-playback-complete" role="status">
            {index === navigationItems.length - 1 ? "最後の動画の再生が終わりました" : "再生が終わりました"}
          </p>
        )}
        <button
          ref={commentButtonRef}
          className="viewer-comment-button"
          type="button"
          disabled={!post || !current}
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((open) => !open)}
        >
          <MessageCircle aria-hidden />
          この投稿にコメント {post && post.comments.length > 0 ? `· ${post.comments.length}件` : ""}
        </button>
      </div>
      <div className="thumbnail-strip" ref={thumbnailStripRef}>
        {navigationItems.map((media, mediaIndex) => (
          <Link
            className={media.id === mediaId && media.postId === postId ? "selected" : ""}
            key={media.id}
            to={`/posts/${media.postId}/media/${media.id}`}
            replace
            state={{ ...(location.state as object | null), playVideo: media.kind === "video" }}
            aria-label={`${media.kind === "video" ? "動画" : "写真"} ${mediaIndex + 1}を開く`}
            aria-current={media.id === mediaId && media.postId === postId ? "true" : undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              showMedia(mediaIndex);
            }}
          >
            <img src={media.thumbnailUrl} alt="" loading="lazy" />
            {media.kind === "video" && (
              <span className="thumbnail-video-mark" aria-hidden>
                ▶
              </span>
            )}
          </Link>
        ))}
      </div>
      {commentsOpen && post && (
        <ViewerComments
          key={post.id}
          post={post}
          onClose={() => {
            setCommentsOpen(false);
            commentButtonRef.current?.focus();
          }}
          onComment={(comment) => {
            const nextPost = { ...post, comments: [...post.comments, comment], commentCount: post.comments.length + 1 };
            setLoadedPost((loaded) => (loaded?.postId === post.id ? { postId: post.id, post: nextPost } : loaded));
            postCache.current.set(post.id, nextPost);
            updateReadingPost(nextPost);
          }}
        />
      )}
    </main>
  );
}

import "../viewer-material.css";
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
import { ViewerImage, type ViewerImageTransform } from "../components/ViewerImage";
import { ErrorState, Loading } from "../components/AsyncState";

const MIN_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 4;
const DEFAULT_IMAGE_TRANSFORM: ViewerImageTransform = { scale: MIN_IMAGE_SCALE, x: 0, y: 0 };

type Point = { x: number; y: number };

export function clampImageScale(scale: number) {
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, scale));
}

export function pointDistance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function pointCenter(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

export function pinchImageTransform(
  start: ViewerImageTransform,
  startCenter: Point,
  nextCenter: Point,
  viewportCenter: Point,
  nextScale: number,
): ViewerImageTransform {
  const scale = clampImageScale(nextScale);
  const focalX = (startCenter.x - viewportCenter.x - start.x) / start.scale;
  const focalY = (startCenter.y - viewportCenter.y - start.y) / start.scale;
  return {
    scale,
    x: nextCenter.x - viewportCenter.x - focalX * scale,
    y: nextCenter.y - viewportCenter.y - focalY * scale,
  };
}

export function clampImageTranslation(
  transform: ViewerImageTransform,
  imageSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
): ViewerImageTransform {
  const scale = clampImageScale(transform.scale);
  if (scale === MIN_IMAGE_SCALE) return DEFAULT_IMAGE_TRANSFORM;
  const maxX = Math.max(0, (imageSize.width * scale - viewportSize.width) / 2);
  const maxY = Math.max(0, (imageSize.height * scale - viewportSize.height) / 2);
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
  };
}

export function swipeDirection(deltaX: number, deltaY: number): "previous" | "next" | null {
  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return null;
  return deltaX > 0 ? "previous" : "next";
}

export function swipeDragOffset(deltaX: number, canMovePrevious: boolean, canMoveNext: boolean) {
  const reachedEdge = (deltaX > 0 && !canMovePrevious) || (deltaX < 0 && !canMoveNext);
  return deltaX * (reachedEdge ? 0.24 : 1);
}

export function mediaExitOffset(direction: "previous" | "next", width: number): number {
  return direction === "previous" ? width : -width;
}

export function isImageTap(deltaX: number, deltaY: number) {
  return Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8;
}

export function isViewerOverlayVisible(kind: Media["kind"] | undefined, preferredVisible: boolean) {
  return kind === "video" || preferredVisible;
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
  const [viewerOverlayVisible, setViewerOverlayVisible] = useState(true);
  const [finishedMedia, setFinishedMedia] = useState<string | null>(null);
  const [playingMedia, setPlayingMedia] = useState<string | null>(null);
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const canPrepare = useVideoPreparation();
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [imageTransform, setImageTransform] = useState<ViewerImageTransform>(DEFAULT_IMAGE_TRANSFORM);
  const imageTransformRef = useRef<ViewerImageTransform>(DEFAULT_IMAGE_TRANSFORM);
  const [imageGestureActive, setImageGestureActive] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const thumbnailPositioned = useRef(false);
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const swipeAnimation = useRef<Animation | null>(null);
  const entryOffset = useRef(0);
  const mediaFrameRef = useRef<HTMLDivElement>(null);
  const imagePointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{
    pointerIds: [number, number];
    distance: number;
    center: Point;
    transform: ViewerImageTransform;
  } | null>(null);
  const panStart = useRef<{
    pointerId: number;
    point: Point;
    transform: ViewerImageTransform;
    allowTap: boolean;
  } | null>(null);
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
  useLayoutEffect(() => {
    const frame = mediaFrameRef.current;
    const offset = entryOffset.current;
    entryOffset.current = 0;
    if (frame?.animate && offset && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swipeAnimation.current = frame.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    }
    return () => {
      swipeAnimation.current?.cancel();
      swipeAnimation.current = null;
    };
  }, [postId, mediaId]);
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
  const constrainImageTransform = useCallback((next: ViewerImageTransform) => {
    const stage = stageRef.current;
    const image = stage?.querySelector<HTMLImageElement>(".viewer-image > img");
    if (!stage || !image) return { ...DEFAULT_IMAGE_TRANSFORM, scale: clampImageScale(next.scale) };
    return clampImageTranslation(
      next,
      { width: image.offsetWidth, height: image.offsetHeight },
      { width: stage.clientWidth, height: stage.clientHeight },
    );
  }, []);
  const applyImageTransform = useCallback(
    (next: ViewerImageTransform) => {
      const constrained = constrainImageTransform(next);
      imageTransformRef.current = constrained;
      setImageTransform(constrained);
    },
    [constrainImageTransform],
  );
  const resetImageTransform = useCallback(() => {
    imagePointers.current.clear();
    pinchStart.current = null;
    panStart.current = null;
    imageTransformRef.current = DEFAULT_IMAGE_TRANSFORM;
    setImageTransform(DEFAULT_IMAGE_TRANSFORM);
    setImageGestureActive(false);
  }, []);
  useLayoutEffect(() => {
    const strip = thumbnailStripRef.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !selected) return;
    const stripBounds = strip.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    // Scroll this strip only; scrollIntoView could also move the page or viewer.
    const left = Math.max(
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
    strip.scrollTo({
      left,
      behavior:
        thumbnailPositioned.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
    thumbnailPositioned.current = true;
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
      swipeAnimation.current?.cancel();
      swipeAnimation.current = null;
      setDragOffset(0);
      setDragging(false);
      resetImageTransform();
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
    [location.state, navigate, navigationItems, resetImageTransform],
  );
  const animateToMedia = useCallback(
    (targetIndex: number, direction: "previous" | "next") => {
      if (targetIndex < 0 || targetIndex >= navigationItems.length || targetIndex === index) return;
      const width = stageRef.current?.clientWidth ?? window.innerWidth;
      entryOffset.current = -mediaExitOffset(direction, width) + dragOffset;
      showMedia(targetIndex);
    },
    [navigationItems.length, index, dragOffset, showMedia],
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
  const cancelSwipe = () => {
    swipeStart.current = null;
    setDragging(false);
    setDragOffset(0);
  };
  const startGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeAnimation.current?.cancel();
    swipeAnimation.current = null;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("video, button, a")) return;
    const onImage =
      current?.kind === "image" && event.target instanceof Element && event.target.closest(".viewer-image");
    if (onImage) {
      const point = { x: event.clientX, y: event.clientY };
      imagePointers.current.set(event.pointerId, point);
      event.currentTarget.setPointerCapture(event.pointerId);
      if (imagePointers.current.size >= 2) {
        const [first, second] = Array.from(imagePointers.current.entries()).slice(0, 2);
        const distance = pointDistance(first[1], second[1]);
        if (distance > 0) {
          pinchStart.current = {
            pointerIds: [first[0], second[0]],
            distance,
            center: pointCenter(first[1], second[1]),
            transform: imageTransformRef.current,
          };
          panStart.current = null;
          cancelSwipe();
          setImageGestureActive(true);
          event.preventDefault();
        }
        return;
      }
      if (imageTransformRef.current.scale > MIN_IMAGE_SCALE) {
        panStart.current = {
          pointerId: event.pointerId,
          point,
          transform: imageTransformRef.current,
          allowTap: true,
        };
        cancelSwipe();
        setImageGestureActive(true);
        event.preventDefault();
        return;
      }
    }
    if (!event.isPrimary) return;
    swipeStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };
  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (imagePointers.current.has(event.pointerId)) {
      imagePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const pinch = pinchStart.current;
    if (pinch) {
      const first = imagePointers.current.get(pinch.pointerIds[0]);
      const second = imagePointers.current.get(pinch.pointerIds[1]);
      const stage = stageRef.current;
      if (!first || !second || !stage) return;
      const center = pointCenter(first, second);
      const rect = stage.getBoundingClientRect();
      applyImageTransform(
        pinchImageTransform(
          pinch.transform,
          pinch.center,
          center,
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          pinch.transform.scale * (pointDistance(first, second) / pinch.distance),
        ),
      );
      event.preventDefault();
      return;
    }
    const pan = panStart.current;
    if (pan?.pointerId === event.pointerId) {
      applyImageTransform({
        ...pan.transform,
        x: pan.transform.x + event.clientX - pan.point.x,
        y: pan.transform.y + event.clientY - pan.point.y,
      });
      event.preventDefault();
      return;
    }
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
  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wasImagePointer = imagePointers.current.delete(event.pointerId);
    if (pinchStart.current) {
      pinchStart.current = null;
      const remaining = Array.from(imagePointers.current.entries())[0];
      if (remaining && imageTransformRef.current.scale > MIN_IMAGE_SCALE) {
        panStart.current = {
          pointerId: remaining[0],
          point: remaining[1],
          transform: imageTransformRef.current,
          allowTap: false,
        };
      } else {
        panStart.current = null;
        setImageGestureActive(false);
      }
      event.preventDefault();
      return;
    }
    if (panStart.current?.pointerId === event.pointerId) {
      const pan = panStart.current;
      panStart.current = null;
      setImageGestureActive(false);
      if (pan.allowTap && isImageTap(event.clientX - pan.point.x, event.clientY - pan.point.y)) {
        setViewerOverlayVisible((visible) => !visible);
      }
      event.preventDefault();
      return;
    }
    if (wasImagePointer && imageTransformRef.current.scale > MIN_IMAGE_SCALE) {
      setImageGestureActive(false);
      event.preventDefault();
      return;
    }
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const direction = swipeDirection(deltaX, deltaY);
    const targetIndex = direction === "previous" ? index - 1 : direction === "next" ? index + 1 : -1;
    if (direction && targetIndex >= 0 && targetIndex < navigationItems.length) {
      animateToMedia(targetIndex, direction);
      return;
    }
    if (current?.kind === "image" && isImageTap(deltaX, deltaY)) {
      setViewerOverlayVisible((visible) => !visible);
    }
    setDragging(false);
    setDragOffset(0);
  };
  const cancelGesture = () => {
    imagePointers.current.clear();
    pinchStart.current = null;
    panStart.current = null;
    setImageGestureActive(false);
    cancelSwipe();
  };
  const overlayVisible = isViewerOverlayVisible(current?.kind, viewerOverlayVisible);
  return (
    <main className={`media-viewer video-viewer${commentsOpen ? " comments-open" : ""}`}>
      <div className={`viewer-viewport${overlayVisible ? " overlay-visible" : " overlay-hidden"}`}>
        <header
          className="viewer-header viewer-overlay"
          aria-hidden={!overlayVisible}
          inert={overlayVisible ? undefined : true}
        >
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
          className={`viewer-stage${current?.kind === "image" ? " image-stage" : ""}`}
          onPointerDown={startGesture}
          onPointerMove={moveGesture}
          onPointerUp={finishGesture}
          onPointerCancel={cancelGesture}
        >
          <div
            ref={mediaFrameRef}
            key={`${postId}/${mediaId}`}
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
              <ViewerImage
                src={current.contentUrl}
                alt={`投稿の写真 ${index + 1}`}
                transform={imageTransform}
                interacting={imageGestureActive}
              />
            )}
          </div>
        </div>
        <div
          className="viewer-info viewer-overlay"
          aria-hidden={!overlayVisible || commentsOpen}
          inert={overlayVisible && !commentsOpen ? undefined : true}
        >
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
              animateToMedia(mediaIndex, mediaIndex < index ? "previous" : "next");
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

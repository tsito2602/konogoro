import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";

export function swipeDirection(deltaX: number, deltaY: number): "previous" | "next" | null {
  if (Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return null;
  return deltaX > 0 ? "previous" : "next";
}

export function MediaViewerPage() {
  const { postId = "", mediaId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const load = () => {
    setError("");
    void api<Post>(`/posts/${postId}`).then(setPost).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<Post>(`/posts/${postId}`).then(setPost).catch((reason: Error) => setError(reason.message));
  }, [postId]);
  const index = post?.media.findIndex((item) => item.id === mediaId) ?? -1;
  const current = post?.media[index];
  const closeViewer = useCallback(() => {
    if (location.state?.returnToPrevious) navigate(-1);
    else navigate(`/posts/${postId}`, { replace: true });
  }, [location.state?.returnToPrevious, navigate, postId]);
  const showMedia = useCallback((targetIndex: number) => {
    if (!post || targetIndex < 0 || targetIndex >= post.media.length) return;
    navigate(`/posts/${postId}/media/${post.media[targetIndex].id}`, { replace: true, state: location.state });
  }, [location.state, navigate, post, postId]);
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
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (current?.kind === "video" && event.target instanceof HTMLVideoElement) {
      const bounds = event.target.getBoundingClientRect();
      if (event.clientY >= bounds.bottom - 52) return;
    }
    swipeStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };
  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    if (direction === "previous") showMedia(index - 1);
    if (direction === "next") showMedia(index + 1);
  };
  if (!post && !error) return <div className="media-viewer"><Loading /></div>;
  if (error || !post || !current) return <div className="media-viewer"><ErrorState message={error || "写真が見つかりません"} retry={error ? load : undefined} /></div>;
  return <main className="media-viewer">
    <header className="viewer-header"><button className="viewer-button" type="button" onClick={closeViewer} aria-label="閉じる"><X /></button><span>{index + 1} / {post.media.length}</span><a className="viewer-button" href={current.downloadUrl} aria-label="保存"><Download /></a></header>
    <div className="viewer-stage" onPointerDown={startSwipe} onPointerUp={finishSwipe} onPointerCancel={() => { swipeStart.current = null; }}>
      {index > 0 && <Link className="viewer-arrow previous" to={`/posts/${postId}/media/${post.media[index - 1].id}`} replace state={location.state} aria-label="前の写真"><ChevronLeft /></Link>}
      {current.kind === "video" ? <video src={current.contentUrl} controls playsInline draggable={false} /> : <img src={current.contentUrl} alt={`${post.title}の写真 ${index + 1}`} draggable={false} />}
      {index < post.media.length - 1 && <Link className="viewer-arrow next" to={`/posts/${postId}/media/${post.media[index + 1].id}`} replace state={location.state} aria-label="次の写真"><ChevronRight /></Link>}
    </div>
    <div className="viewer-info"><strong>{post.title}</strong><span>{formatDate(current.capturedAt ?? post.capturedAt)} · {post.authorName}</span>{(post.eventTitle || post.sectionTitle) && <span>{[post.eventTitle, post.sectionTitle].filter(Boolean).join(" · ")}</span>}</div>
    <div className="thumbnail-strip">{post.media.map((media) => <Link className={media.id === current.id ? "selected" : ""} key={media.id} to={`/posts/${postId}/media/${media.id}`} replace state={location.state}><img src={media.thumbnailUrl} alt="" />{media.kind === "video" && <span className="thumbnail-video-mark" aria-hidden>▶</span>}</Link>)}</div>
  </main>;
}

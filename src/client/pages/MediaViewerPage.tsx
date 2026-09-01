import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";

export function MediaViewerPage() {
  const { postId = "", mediaId = "" } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api<Post>(`/posts/${postId}`).then(setPost).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<Post>(`/posts/${postId}`).then(setPost).catch((reason: Error) => setError(reason.message));
  }, [postId]);
  const index = post?.media.findIndex((item) => item.id === mediaId) ?? -1;
  const current = post?.media[index];
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!post) return;
      if (event.key === "ArrowLeft" && index > 0) navigate(`/posts/${postId}/media/${post.media[index - 1].id}`);
      if (event.key === "ArrowRight" && index < post.media.length - 1) navigate(`/posts/${postId}/media/${post.media[index + 1].id}`);
      if (event.key === "Escape") navigate(`/posts/${postId}`);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [index, navigate, post, postId]);
  if (!post && !error) return <div className="media-viewer"><Loading /></div>;
  if (error || !post || !current) return <div className="media-viewer"><ErrorState message={error || "写真が見つかりません"} retry={error ? load : undefined} /></div>;
  return <main className="media-viewer">
    <header className="viewer-header"><Link className="viewer-button" to={`/posts/${postId}`} aria-label="閉じる"><X /></Link><span>{index + 1} / {post.media.length}</span><a className="viewer-button" href={current.downloadUrl} aria-label="保存"><Download /></a></header>
    <div className="viewer-stage">
      {index > 0 && <Link className="viewer-arrow previous" to={`/posts/${postId}/media/${post.media[index - 1].id}`} aria-label="前の写真"><ChevronLeft /></Link>}
      {current.kind === "video" ? <video src={current.contentUrl} controls playsInline /> : <img src={current.contentUrl} alt={`${post.title}の写真 ${index + 1}`} />}
      {index < post.media.length - 1 && <Link className="viewer-arrow next" to={`/posts/${postId}/media/${post.media[index + 1].id}`} aria-label="次の写真"><ChevronRight /></Link>}
    </div>
    <div className="viewer-info"><strong>{post.title}</strong><span>{formatDate(current.capturedAt ?? post.capturedAt)} · {post.authorName}</span>{(post.eventTitle || post.sectionTitle) && <span>{[post.eventTitle, post.sectionTitle].filter(Boolean).join(" · ")}</span>}</div>
    <div className="thumbnail-strip">{post.media.map((media) => <Link className={media.id === current.id ? "selected" : ""} key={media.id} to={`/posts/${postId}/media/${media.id}`}><img src={media.thumbnailUrl} alt="" />{media.kind === "video" && <span className="thumbnail-video-mark" aria-hidden>▶</span>}</Link>)}</div>
  </main>;
}

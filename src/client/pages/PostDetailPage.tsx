import { Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Comment, Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

export function PostDetailPage() {
  const { postId = "" } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [commentError, setCommentError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { void api<Post>(`/posts/${postId}`).then(setPost).catch((reason: Error) => setError(reason.message)); }, [postId]);
  if (!post && !error) return <><PageHeader title="投稿" back /><Loading /></>;
  if (error) return <><PageHeader title="投稿" back /><ErrorState message={error} /></>;
  if (!post) return null;
  return <>
    <PageHeader title={post.title} back />
    <main className="post-detail page-content">
      <div className="detail-meta">
        {(post.eventTitle || post.sectionTitle) && <p>{[post.eventTitle, post.sectionTitle].filter(Boolean).join(" · ")}</p>}
        <p>{formatDate(post.capturedAt)} · {post.authorName}</p>
      </div>
      <div className="media-grid detail-media-grid" data-count={Math.min(post.media.length, 4)}>
        {post.media.slice(0, 4).map((media, index) => <Link className="media-cell detail-media" key={media.id} to={`/posts/${post.id}/media/${media.id}`}><img src={media.thumbnailUrl} alt={`${post.title}の${media.kind === "video" ? "動画" : "写真"}`} />{media.kind === "video" && <span className="media-play-mark" aria-hidden>▶</span>}{index === 3 && post.media.length >= 4 && <span className="more-count">+{post.media.length - 3}</span>}</Link>)}
      </div>
      {post.caption && <p className="detail-caption">{post.caption}</p>}
      <section className="conversation">
        {post.seenBy.length > 0 && <p className="seen-by">{post.seenBy.map((user) => user.displayName).join("、")}が見ました</p>}
        <h2>コメント</h2>
        {post.comments.length === 0 && <p className="no-comments">まだコメントはありません</p>}
        <div className="comment-list">{post.comments.map((comment) => <CommentRow comment={comment} key={comment.id} onDelete={async () => {
          await api(`/comments/${comment.id}`, { method: "DELETE" });
          setPost((current) => current ? { ...current, comments: current.comments.filter((item) => item.id !== comment.id) } : current);
        }} />)}</div>
        <form className="comment-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault(); setCommentError("");
          const form = event.currentTarget;
          const body = new FormData(form).get("body");
          try { const comment = await api<Comment>(`/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body }) }); setPost((current) => current ? { ...current, comments: [...current.comments, comment] } : current); form.reset(); }
          catch (reason) { setCommentError((reason as Error).message); }
        }}><input name="body" aria-label="コメント" placeholder="コメントを書く" maxLength={1000} required /><button className="primary-button" type="submit">送信</button></form>
        {commentError && <p className="form-error">{commentError}</p>}
      </section>
      {post.canDelete && <section className="post-delete-section">
        <button className="danger-button" type="button" disabled={deleting} onClick={async () => {
          if (!window.confirm("この投稿を削除しますか？写真・動画とコメントも削除されます。")) return;
          setDeleting(true);
          setDeleteError("");
          try {
            await api(`/posts/${post.id}`, { method: "DELETE" });
            navigate(post.eventId ? `/events/${post.eventId}` : "/", { replace: true });
          } catch (reason) {
            setDeleteError((reason as Error).message);
            setDeleting(false);
          }
        }}><Trash2 />{deleting ? "削除中…" : "投稿を削除"}</button>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
      </section>}
    </main>
  </>;
}

function CommentRow({ comment, onDelete }: { comment: Comment; onDelete: () => Promise<void> }) {
  return <article className="comment"><div><strong>{comment.authorName}</strong><span>{formatDate(comment.createdAt)}</span></div><p>{comment.body}</p>{comment.canDelete && <button type="button" onClick={() => void onDelete()} aria-label="コメントを削除"><Trash2 /></button>}</article>;
}

import { Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Comment, Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { useCurrentUser } from "./AppLayout";

export function ViewerComments({
  post,
  onClose,
  onComment,
}: {
  post: Post;
  onClose: () => void;
  onComment: (comment: Comment) => void;
}) {
  const currentUser = useCurrentUser();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const regionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    regionRef.current?.focus();
  }, []);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || !body.trim()) return;
    setSending(true);
    setError("");
    try {
      const comment = await api<Comment>(`/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      onComment(comment);
      setBody("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "コメントを送信できませんでした");
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="viewer-comments" ref={regionRef} tabIndex={-1} aria-label="この投稿のコメント">
      <header>
        <h2>
          この投稿のコメント <span>{post.comments.length}件</span>
        </h2>
        <button className="viewer-button" type="button" onClick={onClose} aria-label="コメントを閉じて写真・動画に戻る">
          <X />
        </button>
      </header>
      <div className="viewer-comment-list" aria-live="polite">
        {post.comments.length === 0 && <p>まだコメントはありません</p>}
        {post.comments.map((comment) => (
          <article key={comment.id}>
            <strong>{comment.authorName}</strong>
            <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>
            <p>{comment.body}</p>
          </article>
        ))}
      </div>
      <form onSubmit={(event) => void send(event)}>
        <label htmlFor="viewer-comment">{currentUser?.displayName ?? "あなた"}として、この投稿にコメント</label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="viewer-comment-input">
          <textarea
            id="viewer-comment"
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="コメントを書く"
            maxLength={1000}
            required
            disabled={sending}
            rows={2}
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            aria-label={sending ? "コメントを送信中" : "コメントを送信"}
          >
            <Send aria-hidden />
          </button>
        </div>
      </form>
    </section>
  );
}

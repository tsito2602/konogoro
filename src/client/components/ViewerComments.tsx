import { Send, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Comment, Post } from "../../shared/types";
import { api, formatDate } from "../api";

export function ViewerComments({
  post,
  onClose,
  onComment,
}: {
  post: Post;
  onClose: () => void;
  onComment: (comment: Comment) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const regionRef = useRef<HTMLElement>(null);
  const closing = useRef(false);
  const closeAnimation = useRef<Animation | null>(null);
  const dismiss = () => {
    if (closing.current) return;
    const region = regionRef.current;
    if (!region?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    closing.current = true;
    const animation = region.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180,
      easing: "ease-out",
      fill: "forwards",
    });
    closeAnimation.current = animation;
    animation.finished.then(onClose).catch(() => {});
  };
  useEffect(() => {
    regionRef.current?.focus({ preventScroll: true });
    return () => {
      closeAnimation.current?.cancel();
    };
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
    <section
      className="viewer-comments"
      ref={regionRef}
      tabIndex={-1}
      aria-label="この投稿のコメント"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <header>
        <h2>
          この投稿のコメント <span>{post.comments.length}件</span>
        </h2>
        <button className="viewer-button" type="button" onClick={dismiss} aria-label="コメントを閉じて写真・動画に戻る">
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
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="viewer-comment-input">
          <textarea
            id="viewer-comment"
            name="body"
            aria-label="この投稿にコメント"
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

import { CalendarDays, Camera, Ellipsis, MessageCircle, Pencil, Send, Trash2, Upload } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Comment, Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ErrorState } from "../components/AsyncState";
import { useCurrentUser } from "../components/AppLayout";
import { CommentComposerSkeleton, PageSkeleton } from "../components/PageSkeleton";
import { SeenBy } from "../components/SeenBy";
import { useToast } from "../components/Toast";

export function PostDetailPage() {
  const { postId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useCurrentUser();
  const showToast = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [commentError, setCommentError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fallbackPath = post?.eventId ? `/events/${post.eventId}` : "/";
  const closeSheet = useCallback(() => {
    if ((location.state as { postSheet?: boolean } | null)?.postSheet) navigate(-1);
    else navigate(fallbackPath, { replace: true });
  }, [fallbackPath, location.state, navigate]);
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
  if (!post && !error)
    return (
      <PostSheet onClose={closeSheet} footer={<CommentComposerSkeleton />}>
        <PageSkeleton variant="post-detail" />
      </PostSheet>
    );
  if (error)
    return (
      <PostSheet onClose={closeSheet}>
        <ErrorState message={error} retry={load} />
      </PostSheet>
    );
  if (!post) return null;
  const deletePost = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      showToast("投稿を削除しました");
      navigate(post.eventId ? `/events/${post.eventId}` : "/", { replace: true });
    } catch (reason) {
      setDeleteError((reason as Error).message);
      setDeleting(false);
    }
  };
  return (
    <PostSheet
      onClose={closeSheet}
      overlay={
        deleteOpen && (
          <div
            className="modal-backdrop"
            onClick={() => {
              if (!deleting) setDeleteOpen(false);
            }}
          >
            <section
              className="confirmation-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-post-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="delete-post-title">この投稿を削除する？</h2>
              <p>写真・動画とコメントもすべて削除される。この操作は元に戻せない。</p>
              {deleteError && (
                <p className="form-error" role="alert">
                  {deleteError}
                </p>
              )}
              <div>
                <button
                  className="outline-button"
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                >
                  キャンセル
                </button>
                <button
                  className="danger-confirm-button"
                  type="button"
                  disabled={deleting}
                  onClick={() => void deletePost()}
                >
                  {deleting ? "削除中…" : "削除する"}
                </button>
              </div>
            </section>
          </div>
        )
      }
      action={
        (post.canEdit || post.canDelete) && (
          <div className="post-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="投稿メニュー"
              aria-expanded={menuOpen}
            >
              <Ellipsis />
            </button>
            {menuOpen && (
              <>
                <button
                  className="post-menu-backdrop"
                  type="button"
                  aria-label="投稿メニューを閉じる"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="post-action-menu" role="menu">
                  {post.canEdit && (
                    <Link
                      to={`/posts/${post.id}/edit`}
                      state={location.state}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Pencil />
                      編集
                    </Link>
                  )}
                  {post.canDelete && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 />
                      削除
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )
      }
      footer={
        <div className="comment-composer">
          {commentError && (
            <p className="form-error" role="alert">
              {commentError}
            </p>
          )}
          <form
            className="comment-form"
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              setCommentError("");
              const form = event.currentTarget;
              const body = new FormData(form).get("body");
              try {
                const comment = await api<Comment>(`/posts/${post.id}/comments`, {
                  method: "POST",
                  body: JSON.stringify({ body }),
                });
                setPost((current) => (current ? { ...current, comments: [...current.comments, comment] } : current));
                form.reset();
              } catch (reason) {
                setCommentError((reason as Error).message);
              }
            }}
          >
            <span className="comment-composer-avatar" aria-hidden>
              {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : currentUser.displayName.slice(0, 1)}
            </span>
            <input name="body" aria-label="コメント" placeholder="コメントを書く" maxLength={1000} required />
            <button type="submit" aria-label="コメントを送信">
              <Send aria-hidden />
            </button>
          </form>
        </div>
      }
    >
      <main className="post-detail">
        <div className="post-detail-head">
          <span className="post-author-row">
            <span className="post-author-avatar" aria-hidden>
              {post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt="" /> : post.authorName.slice(0, 1)}
            </span>
            <strong className="post-author-name">{post.authorName}</strong>
          </span>
          {(post.eventTitle || post.sceneTitle) && (
            <span className="post-context">
              {post.eventTitle && (
                <>
                  <CalendarDays aria-hidden />
                  <span>{post.eventTitle}</span>
                </>
              )}
              {post.eventTitle && post.sceneTitle && <span aria-hidden>›</span>}
              {post.sceneTitle && <span>{post.sceneTitle}</span>}
            </span>
          )}
        </div>
        <div className="media-grid detail-media-grid" data-count={Math.min(post.media.length, 4)}>
          {post.media.slice(0, 4).map((media, index) => (
            <Link
              className="media-cell detail-media"
              key={media.id}
              to={`/posts/${post.id}/media/${media.id}`}
              state={{ ...(location.state as object | null), returnToPrevious: true }}
            >
              <img src={media.thumbnailUrl} alt={`投稿の${media.kind === "video" ? "動画" : "写真"}`} />
              {media.kind === "video" && (
                <span className="media-play-mark" aria-hidden>
                  ▶
                </span>
              )}
              {index === 3 && post.media.length >= 4 && <span className="more-count">+{post.media.length - 3}</span>}
            </Link>
          ))}
        </div>
        <div className="post-detail-copy">
          <div className="post-engagement">
            <SeenBy users={post.seenBy} />
            <span className="comment-count-link" aria-label={`コメント${post.comments.length}件`}>
              <MessageCircle aria-hidden />
              <span>{post.comments.length}</span>
            </span>
            <time
              className="post-date"
              dateTime={post.capturedAt ?? post.publishedAt ?? undefined}
              aria-label={`${post.capturedAt ? "撮影日" : "投稿日"} ${formatPostDate(post.capturedAt ?? post.publishedAt)}`}
            >
              {post.capturedAt ? <Camera aria-hidden /> : <Upload aria-hidden />}
              <span>{formatPostDate(post.capturedAt ?? post.publishedAt)}</span>
            </time>
          </div>
          {post.caption && <p className="detail-caption">{post.caption}</p>}
        </div>
        <section className="conversation">
          <h2>コメント</h2>
          {post.comments.length === 0 && <p className="no-comments">まだコメントはありません</p>}
          <div className="comment-list">
            {post.comments.map((comment) => (
              <CommentRow
                comment={comment}
                key={comment.id}
                onDelete={async () => {
                  await api(`/comments/${comment.id}`, { method: "DELETE" });
                  setPost((current) =>
                    current
                      ? { ...current, comments: current.comments.filter((item) => item.id !== comment.id) }
                      : current,
                  );
                }}
              />
            ))}
          </div>
        </section>
      </main>
    </PostSheet>
  );
}

export function shouldClosePostSheet(deltaY: number): boolean {
  return deltaY >= 72;
}

function PostSheet({
  children,
  action,
  footer,
  overlay,
  onClose,
}: {
  children: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  onClose: () => void;
}) {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragStart = useRef<{ y: number; pointerId: number } | null>(null);
  const closeTimer = useRef<number | null>(null);

  const close = useCallback(() => {
    if (closing) return;
    setDragging(false);
    setDragOffset(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 220);
  }, [closing, onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [close]);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (closing || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragStart.current = { y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setDragOffset(Math.max(0, event.clientY - start.y));
  };
  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (shouldClosePostSheet(event.clientY - start.y)) close();
    else {
      setDragging(false);
      setDragOffset(0);
    }
  };
  const cancelDrag = () => {
    dragStart.current = null;
    setDragging(false);
    setDragOffset(0);
  };

  return (
    <div className={`post-sheet-layer${closing ? " closing" : ""}`}>
      <button className="post-sheet-backdrop" type="button" onClick={close} aria-label="投稿詳細を閉じる" />
      <section
        className={`post-sheet${dragging ? " dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="投稿詳細"
        style={dragging ? { transform: `translate3d(0, ${dragOffset}px, 0)` } : undefined}
      >
        <header className="post-sheet-header">
          <button
            className="post-sheet-handle"
            type="button"
            aria-label="下にスワイプして閉じる"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          >
            <span aria-hidden />
          </button>
          {action && <div className="post-sheet-action">{action}</div>}
        </header>
        <div className="post-sheet-scroll">{children}</div>
        {footer}
      </section>
      {overlay}
    </div>
  );
}

function formatPostDate(value: string | null): string {
  if (!value) return "日付なし";
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(new Date(value));
}

function CommentRow({ comment, onDelete }: { comment: Comment; onDelete: () => Promise<void> }) {
  return (
    <article className="comment">
      <div className="comment-avatar">
        {comment.avatarUrl ? <img src={comment.avatarUrl} alt="" /> : comment.authorName.slice(0, 1)}
      </div>
      <div className="comment-content">
        <div className="comment-meta">
          <strong>{comment.authorName}</strong>
          <span>{formatDate(comment.createdAt)}</span>
        </div>
        <p>{comment.body}</p>
      </div>
      {comment.canDelete && (
        <button type="button" onClick={() => void onDelete()} aria-label="コメントを削除">
          <Trash2 />
        </button>
      )}
    </article>
  );
}

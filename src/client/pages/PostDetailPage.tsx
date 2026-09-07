import { PostModalContext, postOrigin, modalTransform } from "../post-modal";
import { VideoBadge } from "../components/VideoBadge";
import { commentIntent } from "../comment-navigation";
import { canReturnInApp, removeReadingPost, restorePanelPosition, updateReadingPost } from "../reading-context";
import {
  CalendarDays,
  Camera,
  ChevronLeft,
  X,
  Ellipsis,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type FormEvent,
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

export function shouldFocusComment(state: unknown): boolean {
  return commentIntent(state) === "write";
}

export function PostDetailPage() {
  const { postId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const preview = location.state as { previewPostId?: string; previewUrls?: string[] } | null;
  const previewUrls =
    preview?.previewPostId === postId && Array.isArray(preview.previewUrls)
      ? preview.previewUrls.slice(0, 4)
      : undefined;
  const currentUser = useCurrentUser();
  const showToast = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [commentError, setCommentError] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const fallbackPath = post?.eventId ? `/events/${post.eventId}` : "/";
  const closePage = useCallback(() => {
    if ((location.state as { postPage?: boolean } | null)?.postPage && canReturnInApp()) navigate(-1);
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
  useEffect(() => {
    if (post) updateReadingPost(post);
  }, [post]);
  useEffect(() => {
    const panel = conversationRef.current?.closest<HTMLElement>(".post-page-scroll");
    if (!post || !panel) return;
    return restorePanelPosition(location.key, panel, () => {
      const intent = commentIntent(location.state);
      if (intent === "read") {
        const conversation = conversationRef.current!;
        panel.scrollTop =
          conversation.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
        conversation.focus({ preventScroll: true });
      } else if (intent === "write") {
        commentInputRef.current?.focus({ preventScroll: true });
      }
    });
  }, [location.key, location.state, post]);
  if (!post && !error)
    return (
      <PostPage onClose={closePage} footer={<CommentComposerSkeleton />}>
        <PageSkeleton variant="post-detail" previewUrls={previewUrls} />
      </PostPage>
    );
  if (error)
    return (
      <PostPage onClose={closePage}>
        <ErrorState message={error} retry={load} />
      </PostPage>
    );
  if (!post) return null;
  const deletePost = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/posts/${post.id}`, { method: "DELETE" });
      removeReadingPost(post.id);
      showToast("投稿を削除しました");
      closePage();
    } catch (reason) {
      setDeleteError((reason as Error).message);
      setDeleting(false);
    }
  };
  return (
    <PostPage
      onEscape={
        menuOpen || deleteOpen
          ? () => {
              if (!deleting) {
                setMenuOpen(false);
                setDeleteOpen(false);
              }
            }
          : undefined
      }
      onClose={closePage}
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
                      state={{ ...(location.state as object | null), returnToDetail: true }}
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
              if (commentSending) return;
              setCommentError("");
              setCommentSending(true);
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
              } finally {
                setCommentSending(false);
              }
            }}
          >
            <span className="comment-composer-avatar" aria-hidden>
              {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : currentUser.displayName.slice(0, 1)}
            </span>
            <input
              ref={commentInputRef}
              name="body"
              aria-label="この投稿へのコメント"
              placeholder="この投稿にコメント"
              maxLength={1000}
              required
              disabled={commentSending}
            />
            <button
              type="submit"
              aria-label={commentSending ? "コメントを送信中" : "コメントを送信"}
              disabled={commentSending}
            >
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
              {media.kind === "video" && <VideoBadge durationSeconds={media.durationSeconds} />}
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
        <section className="conversation" ref={conversationRef} tabIndex={-1} aria-label="コメント">
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
    </PostPage>
  );
}

function PostPage({
  children,
  action,
  footer,
  overlay,
  onClose,
  onEscape,
}: {
  children: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  onClose: () => void;
  onEscape?: () => void;
}) {
  const modal = useContext(PostModalContext);
  const { postId = "" } = useParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    if (closing) return;
    const panel = panelRef.current;
    if (!modal || !panel?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onClose();
    setClosing(true);
    animationRef.current?.cancel();
    const origin = postOrigin(postId);
    const transform = origin
      ? modalTransform(
          origin.photo.getBoundingClientRect(),
          panel.getBoundingClientRect(),
          window.innerWidth,
          window.innerHeight,
        )
      : null;
    const animation = panel.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: transform ?? "none", opacity: 0 },
      ],
      { duration: 180, easing: "ease-in", fill: "forwards" },
    );
    animationRef.current = animation;
    animation.finished.then(onClose).catch(() => {});
  }, [closing, modal, onClose, postId]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!modal || !dialog || !panel) return;
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });
    const origin = postOrigin(postId);
    const transform = origin
      ? modalTransform(
          origin.photo.getBoundingClientRect(),
          panel.getBoundingClientRect(),
          window.innerWidth,
          window.innerHeight,
        )
      : null;
    if (panel.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animationRef.current = panel.animate(
        [
          { transform: transform ?? "scale(.96)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    return () => {
      animationRef.current?.cancel();
      dialog.close();
      if (origin?.trigger.isConnected) origin.trigger.focus({ preventScroll: true });
    };
  }, [modal, postId]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => {
    if (modal) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        if (onEscape) onEscape();
        else close();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [close, modal, onEscape]);

  const content = (
    <div ref={panelRef} className={`post-page-layer${modal ? " post-modal-panel" : ""}`}>
      <header className="page-header post-page-header">
        <div className="page-header-inner">
          <div className="header-side">
            <button
              ref={closeButtonRef}
              className="icon-button"
              type="button"
              onClick={close}
              aria-label={modal ? "投稿を閉じる" : "戻る"}
            >
              {modal ? <X /> : <ChevronLeft />}
            </button>
          </div>
          <span aria-hidden />
          <div className="header-side header-action">{action}</div>
        </div>
      </header>
      <div className="post-page-scroll">{children}</div>
      {footer}
      {overlay}
    </div>
  );
  return modal ? (
    <dialog
      ref={dialogRef}
      className="post-modal"
      aria-label="投稿詳細"
      onCancel={(event) => {
        event.preventDefault();
        if (onEscape) onEscape();
        else close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {content}
    </dialog>
  ) : (
    content
  );
}

function formatPostDate(value: string | null): string {
  if (!value) return "日付なし";
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", timeZone: "Asia/Tokyo" }).format(
    new Date(value),
  );
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

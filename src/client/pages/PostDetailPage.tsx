import { PostModalContext, postOrigin, postOriginCard, modalTransform } from "../post-modal";
import { VideoBadge } from "../components/VideoBadge";
import { commentIntent, commentTargetId, revealComment } from "../comment-navigation";
import { canReturnInApp, removeReadingPost, restorePanelPosition, updateReadingPost } from "../reading-context";
import { CalendarDays, Camera, X, Ellipsis, MessageCircle, Pencil, Trash2, Upload } from "lucide-react";
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Comment, Post } from "../../shared/types";
import { api, formatDate } from "../api";
import { ErrorState } from "../components/AsyncState";
import { mainDockItems, useCurrentUser } from "../components/AppLayout";
import { MainDock } from "../components/MainDock";
import { PageSkeleton } from "../components/PageSkeleton";
import { SeenBy } from "../components/SeenBy";
import { useToast } from "../components/Toast";
import { DockBackIcon, DockGroup } from "../cartoon/cartoon-dock";
import { RM, SINK, anim, burst } from "../cartoon/cartoon";
import { PostMotion } from "../post-motion";

type MenuPlace = { host: Element; style: { top?: number; bottom?: number; right: number } };

export function PostDetailPage() {
  const { postId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const preview = location.state as { previewPostId?: string; previewUrls?: string[] } | null;
  const previewUrls =
    preview?.previewPostId === postId && Array.isArray(preview.previewUrls)
      ? preview.previewUrls.slice(0, 4)
      : undefined;
  const showToast = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 「…」メニューは kondo のように画面全体の幕の上に出すため、開いている面（シートか body）へ portal で置く。
  const [menuHost, setMenuHost] = useState<MenuPlace | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const conversationRef = useRef<HTMLElement>(null);
  const sentCommentId = useRef<string | null>(null);
  const fallbackPath = post?.eventId ? `/events/${post.eventId}` : "/";
  const closePage = useCallback(() => {
    if ((location.state as { postPage?: boolean } | null)?.postPage && canReturnInApp()) navigate(-1);
    else navigate(fallbackPath, { replace: true });
  }, [fallbackPath, location.state, navigate]);
  const writeIntent = commentIntent(location.state) === "write";
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
      if (commentIntent(location.state) !== "read") return;
      const conversation = conversationRef.current!;
      revealComment(conversation, commentTargetId(location.state));
      conversation.focus({ preventScroll: true });
    });
  }, [location.key, location.state, post]);
  useEffect(() => {
    if (!post || !sentCommentId.current || !conversationRef.current) return;
    // 送ったコメントは上から落ちて、平たくつぶれて着地し、着地点から点がはじける（kondo の sink と burst）。
    const row = revealComment(conversationRef.current, sentCommentId.current);
    sentCommentId.current = null;
    row.classList.remove("comment-arrived");
    if (RM()) return;
    row.style.transformOrigin = "50% 100%";
    void anim(row, SINK(-70), { duration: 380, easing: "cubic-bezier(.4,0,.6,1)" });
    const avatar = row.querySelector(".comment-avatar") ?? row;
    window.setTimeout(() => {
      const box = avatar.getBoundingClientRect();
      burst(box.left + box.width / 2, box.bottom, 9, 46, "var(--p-ink)", row.closest("dialog") ?? undefined);
    }, 230);
  }, [post]);

  const composer = {
    authorName: post?.authorName,
    onSent: (comment: Comment) => {
      sentCommentId.current = comment.id;
      // タイムラインのカードの「コメントn件」も合わせる。
      setPost((current) => {
        if (!current) return current;
        const comments = [...current.comments, comment];
        return { ...current, comments, commentCount: comments.length };
      });
    },
  };
  const menu =
    post && (post.canEdit || post.canDelete)
      ? {
          expanded: menuOpen,
          open: (anchor: HTMLElement) => {
            const box = anchor.getBoundingClientRect();
            const below = box.top < window.innerHeight / 2;
            setMenuHost({
              host: anchor.closest("dialog") ?? document.body,
              style: below
                ? { top: box.bottom + 8, right: window.innerWidth - box.right }
                : { bottom: window.innerHeight - box.top + 10, right: window.innerWidth - box.right },
            });
            setMenuOpen((open) => !open);
          },
        }
      : null;

  if (!post && !error)
    return (
      <PostPage onClose={closePage} composer={composer} startComposing={writeIntent}>
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
      composer={composer}
      startComposing={writeIntent}
      menu={menu}
      overlay={
        <>
          {menuOpen &&
            menuHost &&
            createPortal(
              <>
                <button
                  className="post-menu-backdrop"
                  type="button"
                  aria-label="投稿メニューを閉じる"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  className={`post-action-menu${menuHost.style.bottom !== undefined ? " from-dock" : ""}`}
                  role="menu"
                  style={{ top: "auto", ...menuHost.style }}
                >
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
              </>,
              menuHost.host,
            )}
          {deleteOpen && (
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
          )}
        </>
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
                      ? {
                          ...current,
                          comments: current.comments.filter((item) => item.id !== comment.id),
                          commentCount: current.comments.filter((item) => item.id !== comment.id).length,
                        }
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

type Composer = { authorName?: string; onSent: (comment: Comment) => void };
type Menu = { expanded: boolean; open: (anchor: HTMLElement) => void } | null;

/** キーボードが下から覆っている高さ（visualViewport）。書き込み欄とドックをその上へ載せる。 */
function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const measure = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    const frame = requestAnimationFrame(measure);
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, [active]);
  return active ? inset : 0;
}

function PostPage({
  children,
  overlay,
  onClose,
  onEscape,
  composer,
  startComposing = false,
  menu = null,
}: {
  children: ReactNode;
  overlay?: ReactNode;
  onClose: () => void;
  onEscape?: () => void;
  composer?: Composer;
  startComposing?: boolean;
  menu?: Menu;
}) {
  const modal = useContext(PostModalContext);
  const { postId = "" } = useParams();
  const currentUser = useCurrentUser();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const motionRef = useRef<PostMotion | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const dragRef = useRef<{ start: number; moved: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const keyboard = useKeyboardInset(composing);
  const formId = `post-comment-${postId}`;
  const canCompose = Boolean(composer);

  const backdrop = (from: number, to: number, duration: number) => {
    const dialog = dialogRef.current;
    if (!dialog?.animate || RM()) return;
    try {
      dialog.animate([{ opacity: from }, { opacity: to }], {
        duration,
        easing: "ease-out",
        fill: "forwards",
        pseudoElement: "::backdrop",
      });
    } catch {
      // ::backdrop を動かせない環境では、幕はそのまま出る。
    }
  };

  const openComposer = useCallback(() => {
    const motion = motionRef.current;
    if (!motion || closing || !canCompose) return;
    // iPhone はタップの中で focus しないとキーボードが出ない。欄の inert を先に外してから focus する。
    flushSync(() => {
      setComposing(true);
      setSendError("");
    });
    textRef.current?.focus({ preventScroll: true });
    void motion.lift(motion.liftHeight());
  }, [canCompose, closing]);

  const closeComposer = useCallback(() => {
    setComposing(false);
    textRef.current?.blur();
    return motionRef.current?.drop() ?? Promise.resolve();
  }, []);

  const close = useCallback(async () => {
    if (closing) return;
    const panel = panelRef.current;
    if (composing) await closeComposer();
    // ドックは閉じ始めた時点でタブへ変形を始め、タイムラインのドックがその形から続ける。
    setClosing(true);
    const card = modal ? postOriginCard(postId) : null;
    const motion = motionRef.current;
    if (card && motion && panel && !RM()) {
      backdrop(1, 0, 320);
      await motion.exit(card);
      return onClose();
    }
    if (!modal || !panel?.animate || RM()) return onClose();
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
  }, [closeComposer, closing, composing, modal, onClose, postId]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!panel) return;
    const motion = new PostMotion(
      panel,
      () => panel.querySelector<HTMLElement>(".post-page-scroll > *"),
      () => sheetRef.current,
    );
    motionRef.current = motion;
    motion.paint();
    if (modal && dialog) {
      dialog.showModal();
      closeButtonRef.current?.focus({ preventScroll: true });
    }
    const origin = postOrigin(postId);
    const card = modal ? postOriginCard(postId) : null;
    const write = startComposing && canCompose;
    const height = write ? motion.liftHeight() : null;
    // ドックが送信ボタンに変わるのも、ページが画面を覆って持ち上がり始めてから。
    const startLift = () => setComposing(true);
    if (card && !RM()) {
      // カードの四辺が広がって投稿ページになり、書くときは覆いきったところから止まらずに持ち上がる。
      backdrop(0, 1, 360);
      void motion.enter(card, height, startLift);
    } else {
      if (modal && panel.animate && !RM()) {
        const transform = origin
          ? modalTransform(
              origin.photo.getBoundingClientRect(),
              panel.getBoundingClientRect(),
              window.innerWidth,
              window.innerHeight,
            )
          : null;
        animationRef.current = panel.animate(
          [
            { transform: transform ?? "scale(.96)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
      if (height) {
        // ズームで開くときも、ページが開ききってから持ち上げる（下にタイムラインを見せない）。
        const opened = animationRef.current?.finished ?? Promise.resolve();
        void opened
          .catch(() => {})
          .then(() => {
            if (motionRef.current !== motion) return;
            startLift();
            void motion.lift(height);
          });
      }
    }
    return () => {
      animationRef.current?.cancel();
      motion.reset();
      motionRef.current = null;
      if (modal && dialog) dialog.close();
      if (origin?.trigger.isConnected) origin.trigger.focus({ preventScroll: true });
    };
    // 開いたときに一度だけ動かす（書く意図も開いた時点のもの）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, postId]);

  // タイムラインの「コメントする」から開いたときも、欄が出たら入力できるようにする。
  useEffect(() => {
    const field = textRef.current;
    if (composing && field && document.activeElement !== field) field.focus({ preventScroll: true });
  }, [composing]);
  // キーボードが出入りしたら、書き込み欄とページをその上へ載せ直す。
  useEffect(() => {
    const motion = motionRef.current;
    if (!composing || !motion || motion.entering) return;
    void motion.lift(motion.liftHeight(keyboard));
  }, [composing, keyboard]);
  useEffect(() => {
    const root = document.documentElement.style;
    if (keyboard) root.setProperty("--keyboard-inset", `${keyboard}px`);
    else root.removeProperty("--keyboard-inset");
    return () => {
      root.removeProperty("--keyboard-inset");
    };
  }, [keyboard]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  const escape = useCallback(() => {
    if (composing) void closeComposer();
    else if (onEscape) onEscape();
    else void close();
  }, [close, closeComposer, composing, onEscape]);
  useEffect(() => {
    if (modal) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) escape();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [escape, modal]);

  // 持ち上がったページ：押すと下ろす、下へ引くと指についてくる。
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!composing) return;
    event.preventDefault();
    dragRef.current = { start: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const motion = motionRef.current;
    if (!drag || !motion) return;
    drag.moved = Math.max(0, event.clientY - drag.start);
    const height = motion.liftHeight(keyboard);
    motion.follow(-height + Math.min(drag.moved, height));
  };
  const pointerUp = () => {
    const drag = dragRef.current;
    const motion = motionRef.current;
    dragRef.current = null;
    if (!drag || !motion) return;
    if (drag.moved < 6 || drag.moved > 70) void closeComposer();
    else void motion.lift(motion.liftHeight(keyboard));
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = text.trim();
    if (!composer || sending || !body) return;
    setSendError("");
    setSending(true);
    try {
      const comment = await api<Comment>(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setText("");
      await closeComposer();
      composer.onSent(comment);
    } catch (reason) {
      setSendError((reason as Error).message);
    } finally {
      setSending(false);
    }
  };

  const avatar = currentUser.avatarUrl ? (
    <img src={currentUser.avatarUrl} alt="" />
  ) : (
    currentUser.displayName.slice(0, 1)
  );
  const sheet = composer && (
    <form
      id={formId}
      ref={sheetRef}
      className="comment-sheet"
      inert={!composing || undefined}
      aria-hidden={!composing || undefined}
      aria-label="コメントする"
      onSubmit={(event) => void send(event)}
    >
      <div className="comment-sheet-head">
        <span className="comment-sheet-who">
          <span className="comment-sheet-avatar" aria-hidden>
            {avatar}
          </span>
          {currentUser.displayName}としてコメント
        </span>
        {composer.authorName && <span>{composer.authorName}さんの投稿</span>}
      </div>
      {sendError && (
        <p className="form-error" role="alert">
          {sendError}
        </p>
      )}
      <label className="comment-sheet-field">
        <textarea
          ref={textRef}
          name="body"
          aria-label="この投稿へのコメント"
          placeholder="この投稿にコメント"
          maxLength={1000}
          value={text}
          disabled={sending}
          onChange={(event) => setText(event.target.value)}
        />
        <span className="comment-sheet-count" aria-hidden>
          {text.length} / 1000
        </span>
      </label>
      <button className="comment-sheet-send" type="submit" disabled={sending || !text.trim()}>
        {sending ? "送信中…" : "送信"}
      </button>
    </form>
  );

  // 画面に1つのドック：戻る・コメントする・…、書くときは送信ボタン、閉じるときはタブへ形を変える。
  const dockControls = closing ? undefined : composing ? (
    <DockGroup slot="r" className="cdock-center cdock-send">
      <button type="submit" form={formId} disabled={sending || !text.trim()}>
        {sending ? "送信中…" : "送信"}
      </button>
    </DockGroup>
  ) : (
    <>
      <DockGroup slot="l">
        <button type="button" onClick={() => void close()} aria-label={modal ? "投稿を閉じる" : "戻る"}>
          <DockBackIcon />
        </button>
      </DockGroup>
      {canCompose && (
        <DockGroup slot={menu ? "m" : "r"} tone="ink" stretch>
          <button type="button" onClick={openComposer}>
            <MessageCircle aria-hidden />
            コメントする
          </button>
        </DockGroup>
      )}
      {menu && (
        <DockGroup slot="r">
          <button
            type="button"
            aria-label="投稿メニュー"
            aria-expanded={menu.expanded}
            onClick={(event) => menu.open(event.currentTarget)}
          >
            <Ellipsis />
          </button>
        </DockGroup>
      )}
    </>
  );
  const dock = (
    <MainDock items={mainDockItems} className="post-dock" label={closing ? undefined : "投稿の操作"}>
      {dockControls}
    </MainDock>
  );

  const content = (
    <div
      ref={panelRef}
      className={`post-page-layer${modal ? " post-modal-panel" : ""}${composing ? " composing" : ""}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <header className="page-header post-page-header">
        <div className="page-header-inner">
          <div className="header-side">
            <button
              ref={closeButtonRef}
              className="icon-button"
              type="button"
              onClick={() => void close()}
              aria-label={modal ? "投稿を閉じる" : "戻る"}
            >
              <X />
            </button>
          </div>
          {canCompose ? (
            <button className="post-header-comment" type="button" onClick={openComposer}>
              <MessageCircle aria-hidden />
              コメントする
            </button>
          ) : (
            <span aria-hidden />
          )}
          <div className="header-side header-action">
            {menu && (
              <button
                className="icon-button"
                type="button"
                onClick={(event) => menu.open(event.currentTarget)}
                aria-label="投稿メニュー"
                aria-expanded={menu.expanded}
              >
                <Ellipsis />
              </button>
            )}
          </div>
        </div>
      </header>
      <div className="post-page-scroll">{children}</div>
      {/* 持ち上がったページの下端のつまみ。押すか下へ引くと欄を閉じられることを示す。 */}
      <span className="post-lift-handle" aria-hidden />
    </div>
  );
  return modal ? (
    <dialog
      ref={dialogRef}
      className="post-modal"
      aria-label="投稿詳細"
      onCancel={(event) => {
        event.preventDefault();
        escape();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) void close();
      }}
    >
      {sheet}
      {content}
      {dock}
      {overlay}
    </dialog>
  ) : (
    <>
      {sheet}
      {content}
      {dock}
      {overlay}
    </>
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
    <article className="comment" data-comment-id={comment.id}>
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

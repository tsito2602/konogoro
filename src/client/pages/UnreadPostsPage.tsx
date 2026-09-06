import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api } from "../api";
import { ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { PostCard } from "../components/PostCard";
import { useSeenTracking } from "../hooks/useSeenTracking";

type UnreadPostsResponse = { posts: Post[]; unreadCount: number };

export function UnreadPostsPage() {
  const [response, setResponse] = useState<UnreadPostsResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fetching = useRef(false);
  const resetScroll = useRef(false);

  useLayoutEffect(() => {
    if (!resetScroll.current) return;
    resetScroll.current = false;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [response]);

  const loadNext = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    setError("");
    try {
      const next = await api<UnreadPostsResponse>("/unread-posts");
      resetScroll.current = true;
      setResponse(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "投稿を取得できませんでした");
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api<UnreadPostsResponse>("/unread-posts")
      .then((result) => {
        if (active) setResponse(result);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const post = response?.posts[0];
  return (
    <>
      <PageHeader title="新しい思い出" />
      <main className="unread-flow">
        {!response && !error && <PageSkeleton variant="timeline" />}
        {!response && error && <ErrorState message={error} retry={() => void loadNext()} />}
        {response && !post && <UnreadComplete />}
        {response && post && (
          <UnreadPostStep
            key={post.id}
            post={post}
            unreadCount={response.unreadCount}
            loading={loading}
            loadError={error}
            loadNext={loadNext}
          />
        )}
      </main>
    </>
  );
}

function UnreadPostStep({
  post,
  unreadCount,
  loading,
  loadError,
  loadNext,
}: {
  post: Post;
  unreadCount: number;
  loading: boolean;
  loadError: string;
  loadNext: () => Promise<void>;
}) {
  const [viewError, setViewError] = useState("");
  const advancing = useRef(false);
  const { ref, viewed, recording, markViewed } = useSeenTracking(post.id, post.viewedByCurrentUser, {
    onViewed: () => setViewError(""),
    onError: setViewError,
  });
  const remainingCount = Math.max(0, unreadCount - (viewed ? 1 : 0));
  const advance = async () => {
    if (advancing.current) return;
    advancing.current = true;
    setViewError("");
    try {
      await markViewed();
      await loadNext();
    } catch {
      /* Keep the current post and retry the failed recording. */
    } finally {
      advancing.current = false;
    }
  };
  return (
    <>
      <div className="unread-progress" role="status">
        <span>新しい思い出</span>
        <strong>残り{remainingCount}件</strong>
      </div>
      <section ref={ref} aria-label="新しい投稿">
        <PostCard post={{ ...post, viewedByCurrentUser: viewed }} trackSeen={false} />
      </section>
      <div className="unread-actions" aria-busy={recording || loading}>
        {(viewError || loadError) && (
          <div className="unread-view-error" role="alert">
            <p>{viewError ? "閲覧を記録できませんでした。" : "次の投稿を取得できませんでした。"}</p>
            <p>{viewError || loadError}</p>
          </div>
        )}
        <button
          className="primary-button wide"
          type="button"
          disabled={recording || loading}
          onClick={() => void advance()}
        >
          {recording
            ? "閲覧を記録中…"
            : loading
              ? "次の投稿を取得中…"
              : viewError
                ? "閲覧の記録を再試行して進む"
                : loadError
                  ? "次の投稿の取得を再試行"
                  : remainingCount === 0
                    ? "新着の確認を終える"
                    : "次の思い出を見る"}
        </button>
      </div>
    </>
  );
}

export function UnreadComplete() {
  return (
    <section className="unread-complete">
      <span aria-hidden>
        <Check />
      </span>
      <h2>新しい投稿はここまでです</h2>
      <p>また新しい投稿が届いたら、タイムラインでお知らせします。</p>
      <Link className="primary-button" to="/">
        タイムラインへ戻る
      </Link>
    </section>
  );
}

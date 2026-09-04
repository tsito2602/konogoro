import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api } from "../api";
import { ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { PostCard } from "../components/PostCard";

type UnreadPostsResponse = { posts: Post[]; unreadCount: number };

export function UnreadPostsPage() {
  const [response, setResponse] = useState<UnreadPostsResponse | null>(null);
  const [error, setError] = useState("");
  const [viewError, setViewError] = useState("");
  const [viewed, setViewed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const loadNext = useCallback(() => {
    setError("");
    setViewError("");
    setViewed(false);
    setResponse(null);
    void api<UnreadPostsResponse>("/unread-posts")
      .then(setResponse)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    void api<UnreadPostsResponse>("/unread-posts")
      .then(setResponse)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const post = response?.posts[0];
  const remainingCount = Math.max(0, (response?.unreadCount ?? 0) - (viewed ? 1 : 0));

  return (
    <>
      <PageHeader title="新しい思い出" />
      <main className="unread-flow">
        {!response && !error && <PageSkeleton variant="timeline" />}
        {error && <ErrorState message={error} retry={loadNext} />}
        {response && !post && <UnreadComplete />}
        {response && post && (
          <>
            <div className="unread-progress" role="status">
              <span>新しい思い出</span>
              <strong>残り{remainingCount}件</strong>
            </div>
            <PostCard
              key={`${post.id}:${retryKey}`}
              post={post}
              onViewed={() => {
                setViewed(true);
                setViewError("");
              }}
              onViewError={(message) => setViewError(message)}
            />
            <div className="unread-actions">
              {viewError && (
                <div className="unread-view-error" role="alert">
                  <p>{viewError}</p>
                  <button
                    className="outline-button"
                    type="button"
                    onClick={() => {
                      setViewError("");
                      setRetryKey((key) => key + 1);
                    }}
                  >
                    既読を再試行
                  </button>
                </div>
              )}
              <button className="primary-button wide" type="button" disabled={!viewed} onClick={loadNext}>
                {remainingCount === 0 ? "見終わる" : "次の思い出を見る"}
              </button>
              {!viewed && !viewError && <p>2秒見ると次へ進めます</p>}
            </div>
          </>
        )}
      </main>
    </>
  );
}

export function UnreadComplete() {
  return (
    <section className="unread-complete">
      <span aria-hidden>
        <Check />
      </span>
      <h2>新しい思い出はすべて見ました</h2>
      <p>また新しい投稿が届いたら、タイムラインでお知らせします。</p>
      <Link className="primary-button" to="/">
        タイムラインへ戻る
      </Link>
    </section>
  );
}

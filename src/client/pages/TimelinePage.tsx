import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { PostCard } from "../components/PostCard";
import { useCurrentUser } from "../components/AppLayout";

export function TimelinePage() {
  const currentUser = useCurrentUser();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const load = () => {
    setError("");
    void api<TimelineResponse>("/timeline")
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount);
      })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<TimelineResponse>("/timeline")
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const data = await api<TimelineResponse>(`/timeline?cursor=${encodeURIComponent(nextCursor)}`);
      setPosts((current) => (current ? appendUniquePosts(current, data.posts) : data.posts));
      setNextCursor(data.nextCursor);
    } catch (reason) {
      setMoreError((reason as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <PageHeader title="タイムライン" />
      <main className="timeline-layout page-content">
        {posts && currentUser.role === "viewer" && unreadCount > 0 && (
          <aside className="timeline-sidebar">
            <UnreadSummary count={unreadCount} />
          </aside>
        )}
        <section className="feed" aria-label="タイムライン">
          {!posts && !error && <PageSkeleton variant="timeline" />}
          {error && <ErrorState message={error} retry={load} />}
          {posts?.length === 0 && (
            <EmptyState
              title="まだ投稿がありません"
              body={
                currentUser.role === "viewer"
                  ? "新しい思い出が追加されると、ここに表示されます。"
                  : "写真をまとめて、最初の思い出を追加できます。"
              }
              action={
                currentUser.role === "viewer" ? undefined : (
                  <Link className="primary-button" to="/posts/new">
                    写真を追加
                  </Link>
                )
              }
            />
          )}
          {posts?.map((post, index) => {
            const month = formatTimelineMonth(timelineDate(post));
            const previous = posts[index - 1];
            const previousMonth = previous ? formatTimelineMonth(timelineDate(previous)) : null;
            return (
              <Fragment key={post.id}>
                {month !== previousMonth && <h2 className="timeline-month-heading">{month}</h2>}
                <PostCard post={post} onViewed={() => setUnreadCount((count) => Math.max(0, count - 1))} />
              </Fragment>
            );
          })}
          {posts && nextCursor && (
            <div className="form-page">
              {moreError && (
                <p className="form-error" role="alert">
                  {moreError}
                </p>
              )}
              <button
                className="outline-button wide"
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "読み込み中…" : "さらに読み込む"}
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

type TimelineResponse = { posts: Post[]; nextCursor: string | null; unreadCount: number };

export function UnreadSummary({ count }: { count: number }) {
  return (
    <section className="unread-summary" aria-labelledby="unread-summary-title">
      <div>
        <strong>{count}件</strong>
        <h2 id="unread-summary-title">新しい思い出があります</h2>
      </div>
      <Link className="primary-button" to="/unread">
        新しい思い出を見る
      </Link>
    </section>
  );
}

export function appendUniquePosts(current: Post[], incoming: Post[]): Post[] {
  const ids = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => !ids.has(post.id))];
}

export function formatTimelineMonth(value: string | null): string {
  if (!value) return "日付なし";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function timelineDate(post: Post): string | null {
  return post.eventStartDate ?? post.eventEndDate ?? post.capturedAt ?? post.publishedAt;
}

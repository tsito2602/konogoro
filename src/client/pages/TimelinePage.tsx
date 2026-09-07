import { ArrowUpRight, Bookmark } from "lucide-react";
import { readPages, useReadingState } from "../reading-context";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton, UnreadSummarySkeleton } from "../components/PageSkeleton";
import { PostCard } from "../components/PostCard";
import { useCurrentUser } from "../components/AppLayout";

export function TimelinePage() {
  const currentUser = useCurrentUser();
  const [posts, setPosts] = useReadingState<Post[] | null>("posts", null);
  const [nextCursor, setNextCursor] = useReadingState<string | null>("nextCursor", null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useReadingState("unreadCount", 0);
  const [restoreCount] = useState(() => posts?.length ?? 0);
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
    void readPages<TimelineResponse>("/timeline", "posts", restoreCount)
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setUnreadCount(data.unreadCount);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [restoreCount, setPosts, setNextCursor, setUnreadCount]);

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
        {currentUser.role === "viewer" && ((!posts && !error) || (posts && unreadCount > 0)) && (
          <aside className="timeline-sidebar">
            {posts ? (
              <UnreadSummary count={unreadCount} previewUrl={unreadPreview(posts)} />
            ) : (
              <UnreadSummarySkeleton />
            )}
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
          {groupTimelinePosts(posts ?? []).map((group) => (
            <section className="timeline-month-group" key={group.posts[0].id} aria-label={group.month}>
              <h2 className="timeline-month-heading">
                <span>{group.month}</span>
              </h2>
              {group.posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onViewed={() => {
                    setUnreadCount((count) => Math.max(0, count - 1));
                    setPosts(
                      (current) =>
                        current?.map((item) => (item.id === post.id ? { ...item, viewedByCurrentUser: true } : item)) ??
                        null,
                    );
                  }}
                />
              ))}
            </section>
          ))}
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

export function UnreadSummary({ count, previewUrl }: { count: number; previewUrl?: string }) {
  return (
    <section className="unread-summary" aria-labelledby="unread-summary-title">
      <div className="unread-summary-art" aria-hidden="true">
        {previewUrl ? <img src={previewUrl} alt="" /> : <Bookmark />}
        <span className="unread-bookmark">
          <Bookmark />
        </span>
      </div>
      <div className="unread-summary-copy">
        <strong>{count}件</strong>
        <h2 id="unread-summary-title">新しい思い出があります</h2>
      </div>
      <Link className="primary-button" to="/unread">
        新しい思い出を見る
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </section>
  );
}

export function unreadPreview(posts: Post[]): string | undefined {
  return posts.find((post) => !post.viewedByCurrentUser && post.media.length > 0)?.media[0].thumbnailUrl;
}

export function groupTimelinePosts(posts: Post[]) {
  const groups: { month: string; posts: Post[] }[] = [];
  for (const post of posts) {
    const month = formatTimelineMonth(timelineDate(post));
    const last = groups.at(-1);
    if (last?.month === month) last.posts.push(post);
    else groups.push({ month, posts: [post] });
  }
  return groups;
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

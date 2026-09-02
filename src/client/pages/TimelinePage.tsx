import { useEffect, useState } from "react";
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
  const load = () => {
    setError("");
    void api<TimelineResponse>("/timeline")
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
      })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<TimelineResponse>("/timeline")
      .then((data) => {
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
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
      <main className="feed">
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
        {posts?.map((post) => (
          <PostCard post={post} key={post.id} />
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
      </main>
    </>
  );
}

type TimelineResponse = { posts: Post[]; nextCursor: string | null };

export function appendUniquePosts(current: Post[], incoming: Post[]): Post[] {
  const ids = new Set(current.map((post) => post.id));
  return [...current, ...incoming.filter((post) => !ids.has(post.id))];
}

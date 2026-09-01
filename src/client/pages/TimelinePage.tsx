import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";

export function TimelinePage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api<{ posts: Post[] }>("/timeline").then((data) => setPosts(data.posts)).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<{ posts: Post[] }>("/timeline").then((data) => setPosts(data.posts)).catch((reason: Error) => setError(reason.message));
  }, []);

  return <>
    <PageHeader title="タイムライン" action={<Link className="header-link" to="/posts/new">追加</Link>} />
    <main className="feed">
      {!posts && !error && <Loading />}
      {error && <ErrorState message={error} retry={load} />}
      {posts?.length === 0 && <EmptyState title="まだ投稿がありません" body="写真をまとめて、最初の思い出を追加できます。" action={<Link className="primary-button" to="/posts/new">写真を追加</Link>} />}
      {posts?.map((post) => <PostCard post={post} key={post.id} />)}
    </main>
  </>;
}

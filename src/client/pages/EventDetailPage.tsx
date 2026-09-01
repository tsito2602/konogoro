import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { EventDetail } from "../../shared/types";
import { api, eventDate } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";
import { useCurrentUser } from "../components/AppLayout";
import { canCreatePost, canManageEvent } from "../../shared/permissions";

export function EventDetailPage() {
  const currentUser = useCurrentUser();
  const canAddPost = canCreatePost(currentUser);
  const { eventId = "" } = useParams();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api<EventDetail>(`/events/${eventId}`).then(setDetail).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<EventDetail>(`/events/${eventId}`).then(setDetail).catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  if (!detail && !error) return <><PageHeader title="イベント" back /><Loading /></>;
  if (error) return <><PageHeader title="イベント" back /><ErrorState message={error} retry={load} /></>;
  if (!detail) return null;
  const groups = [{ id: null, title: "", posts: detail.posts.filter((post) => !post.sectionId) }, ...detail.sections.map((section) => ({ ...section, posts: detail.posts.filter((post) => post.sectionId === section.id) }))].filter((group) => group.posts.length > 0);
  return <>
    <PageHeader title={detail.title} back action={canManageEvent(currentUser) ? <Link className="icon-button" to={`/events/${detail.id}/edit`} aria-label="イベントを編集"><Pencil /></Link> : undefined} />
    <main className="event-detail">
      <section className={`event-cover${detail.coverUrl ? "" : " no-cover"}`} style={detail.coverUrl ? { backgroundImage: `url(${detail.coverUrl})` } : undefined}>
        <div><p>{eventDate(detail.startDate, detail.endDate)}</p><h2>{detail.title}</h2><span>{eventCounts(detail.postCount, detail.photoCount, detail.videoCount)}</span></div>
      </section>
      {canAddPost && <div className="event-actions"><Link className="primary-button" to={`/posts/new?event=${detail.id}`}>投稿を追加</Link></div>}
      {groups.length === 0 && <EmptyState title="まだ投稿がありません" body={canAddPost ? "このイベントの写真を追加できます。" : "投稿が追加されると、ここに表示されます。"} action={canAddPost ? <Link className="primary-button" to={`/posts/new?event=${detail.id}`}>写真を追加</Link> : undefined} />}
      {groups.map((group) => <section className="event-section" key={group.id ?? "none"}>
        {group.title && <h2>{group.title}</h2>}
        {group.posts.map((post) => <PostCard key={post.id} post={post} showContext={false} />)}
      </section>)}
    </main>
  </>;
}

function eventCounts(posts: number, photos: number, videos: number): string {
  return [`投稿${posts}件`, photos ? `写真${photos}枚` : "", videos ? `動画${videos}本` : ""].filter(Boolean).join(" · ");
}

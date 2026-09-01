import { MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Activity } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

type ActivityResponse = { activities: Activity[]; nextCursor: string | null };

export function ActivityPage() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = () => {
    setError("");
    void api<ActivityResponse>("/activity").then((data) => {
      setActivities(data.activities); setNextCursor(data.nextCursor);
    }).catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void api<ActivityResponse>("/activity").then((data) => {
      setActivities(data.activities); setNextCursor(data.nextCursor);
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setMoreError("");
    try {
      const data = await api<ActivityResponse>(`/activity?cursor=${encodeURIComponent(nextCursor)}`);
      setActivities((current) => current ? appendUniqueActivities(current, data.activities) : data.activities);
      setNextCursor(data.nextCursor);
    } catch (reason) { setMoreError((reason as Error).message); }
    finally { setLoadingMore(false); }
  };

  return <>
    <PageHeader title="近況" action={<Link className="header-link" to="/timeline">投稿一覧</Link>} />
    <main className="activity-page page-content">
      {!activities && !error && <Loading />}
      {error && <ErrorState message={error} retry={load} />}
      {activities?.length === 0 && <EmptyState title="まだ近況はありません" body="投稿やコメント、みたよがここに表示されます。" />}
      {activities && <div className="activity-list">{activities.map((activity) => <Link className="activity-row" to={`/posts/${activity.postId}`} key={activity.id}>
        <span className={`activity-icon ${activity.kind}`} aria-hidden>{activity.kind === "post" ? <Send /> : activity.kind === "comment" ? <MessageCircle /> : "👀"}</span>
        <span className="activity-copy"><span>{activityText(activity)}</span>{activity.body && <small>「{activity.body}」</small>}<time dateTime={activity.occurredAt}>{formatActivityDate(activity.occurredAt)}</time></span>
        {activity.thumbnailUrl && <img src={activity.thumbnailUrl} alt="" loading="lazy" />}
      </Link>)}</div>}
      {activities && nextCursor && <div className="form-page">
        {moreError && <p className="form-error" role="alert">{moreError}</p>}
        <button className="outline-button wide" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "読み込み中…" : "さらに読み込む"}</button>
      </div>}
    </main>
  </>;
}

export function activityText(activity: Activity): string {
  if (activity.kind === "post") return `${activity.actorName}さんが「${activity.postTitle}」を投稿しました`;
  if (activity.kind === "comment") return `${activity.actorName}さんが「${activity.postTitle}」にコメントしました`;
  return `${activity.actorName}さんが「${activity.postTitle}」をみたよ`;
}

export function appendUniqueActivities(current: Activity[], incoming: Activity[]): Activity[] {
  const ids = new Set(current.map((activity) => activity.id));
  return [...current, ...incoming.filter((activity) => !ids.has(activity.id))];
}

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

import { MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Activity, MemberLastViewed } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

type ActivityResponse = { activities: Activity[]; memberLastViewed: MemberLastViewed[]; nextCursor: string | null };

export function ActivityPage() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [memberLastViewed, setMemberLastViewed] = useState<MemberLastViewed[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = () => {
    setError("");
    void api<ActivityResponse>("/activity").then((data) => {
      setActivities(data.activities); setMemberLastViewed(data.memberLastViewed); setNextCursor(data.nextCursor);
    }).catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void api<ActivityResponse>("/activity").then((data) => {
      setActivities(data.activities); setMemberLastViewed(data.memberLastViewed); setNextCursor(data.nextCursor);
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
    <PageHeader title="近況" />
    <main className="activity-page page-content">
      {!activities && !error && <Loading />}
      {error && <ErrorState message={error} retry={load} />}
      {activities && <MemberLastViewedList members={memberLastViewed} />}
      {activities?.length === 0 && <EmptyState title="まだ近況はありません" body="投稿やコメントがここに表示されます。" />}
      {activities && <div className="activity-list">{activities.map((activity) => <Link className="activity-row" to={`/posts/${activity.postId}`} key={activity.id}>
        <span className={`activity-icon ${activity.kind}`} aria-hidden>{activity.kind === "post" ? <Send /> : <MessageCircle />}</span>
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
  const label = activity.postCaption.length > 30 ? `${activity.postCaption.slice(0, 30)}…` : activity.postCaption;
  if (activity.kind === "post") return label ? `${activity.actorName}さんが「${label}」を投稿しました` : `${activity.actorName}さんが写真・動画を投稿しました`;
  return label ? `${activity.actorName}さんが「${label}」にコメントしました` : `${activity.actorName}さんが投稿にコメントしました`;
}

export function appendUniqueActivities(current: Activity[], incoming: Activity[]): Activity[] {
  const ids = new Set(current.map((activity) => activity.id));
  return [...current, ...incoming.filter((activity) => !ids.has(activity.id))];
}

export function formatLastViewedAt(value: string | null, now = Date.now()): string {
  if (!value) return "まだ見ていない";
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (elapsedSeconds < 60) return "たった今";
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}分前`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}時間前`;
  const elapsedDays = Math.floor(elapsedSeconds / 86400);
  if (elapsedDays === 1) return "昨日";
  if (elapsedDays < 30) return `${elapsedDays}日前`;
  if (elapsedDays < 365) return `${Math.floor(elapsedDays / 30)}か月前`;
  return `${Math.floor(elapsedDays / 365)}年前`;
}

function MemberLastViewedList({ members }: { members: MemberLastViewed[] }) {
  return <section className="member-last-viewed" aria-labelledby="member-last-viewed-title">
    <h2 id="member-last-viewed-title">みたよ履歴</h2>
    <div className="member-last-viewed-list">
      {members.map((member, index) => <div className="member-last-viewed-item" key={member.id}>
        <span className={`member-last-viewed-avatar color-${index % 5}`}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}</span>
        <strong>{member.displayName}</strong>
        <time dateTime={member.lastViewedAt ?? undefined}>{formatLastViewedAt(member.lastViewedAt)}</time>
      </div>)}
    </div>
  </section>;
}

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

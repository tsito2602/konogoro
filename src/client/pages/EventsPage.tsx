import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EventSummary } from "../../shared/types";
import { api, eventDate } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

export function EventsPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    void api<{ events: EventSummary[] }>("/events").then((data) => setEvents(data.events)).catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<{ events: EventSummary[] }>("/events").then((data) => setEvents(data.events)).catch((reason: Error) => setError(reason.message));
  }, []);
  return <>
    <PageHeader title="イベント" action={<Link className="icon-button" to="/events/new" aria-label="イベントを作成"><Plus /></Link>} />
    <main className="event-list page-content">
      {!events && !error && <Loading />}
      {error && <ErrorState message={error} retry={load} />}
      {events?.length === 0 && <EmptyState title="イベントがありません" body="旅行や大きなお出かけをまとめられます。" action={<Link className="primary-button" to="/events/new">イベントを作成</Link>} />}
      {events?.map((event) => <Link className={`event-card${event.coverUrl ? "" : " no-cover"}`} to={`/events/${event.id}`} key={event.id} style={event.coverUrl ? { backgroundImage: `url(${event.coverUrl})` } : undefined}>
        <div className="event-card-copy">
          <p>{eventDate(event.startDate, event.endDate)}</p>
          <h2>{event.title}</h2>
          <span>{mediaCounts(event.photoCount, event.videoCount)}</span>
        </div>
      </Link>)}
    </main>
  </>;
}

function mediaCounts(photos: number, videos: number): string {
  return [photos ? `写真${photos}枚` : "", videos ? `動画${videos}本` : ""].filter(Boolean).join(" · ") || "メディア0件";
}

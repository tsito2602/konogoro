import { ListFilter, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EventSummary } from "../../shared/types";
import { api, eventDate } from "../api";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { eventTiming, type EventTiming } from "../../shared/event-timing";

export type EventFilters = {
  keyword: string;
  from: string;
  to: string;
  status: "all" | EventTiming;
};

const emptyFilters: EventFilters = { keyword: "", from: "", to: "", status: "all" };

export function EventsPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<EventFilters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<EventFilters>(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterClosing, setFilterClosing] = useState(false);
  const load = () => {
    setError("");
    void api<{ events: EventSummary[] }>("/events")
      .then((data) => setEvents(data.events))
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void api<{ events: EventSummary[] }>("/events")
      .then((data) => setEvents(data.events))
      .catch((reason: Error) => setError(reason.message));
  }, []);
  const filteredEvents = events ? filterEvents(events, filters) : null;
  const activeFilterCount = [filters.keyword.trim(), filters.from || filters.to, filters.status !== "all"].filter(
    Boolean,
  ).length;
  const invalidRange = Boolean(draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to);
  const eventGroups = filteredEvents ? groupEvents(filteredEvents) : [];
  const openFilters = () => {
    setDraftFilters(filters);
    setFilterClosing(false);
    setFilterOpen(true);
  };
  const closeFilters = () => setFilterClosing(true);
  return (
    <>
      <PageHeader
        title="イベント"
        action={
          <button
            className={`icon-button event-filter-button${activeFilterCount ? " active" : ""}`}
            type="button"
            onClick={openFilters}
            aria-label={
              activeFilterCount ? `イベントを絞り込む、${activeFilterCount}件の条件を適用中` : "イベントを絞り込む"
            }
          >
            <ListFilter />
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
        }
      />
      <main className="event-list page-content">
        {!events && !error && <PageSkeleton variant="events" />}
        {error && <ErrorState message={error} retry={load} />}
        {events?.length === 0 && (
          <EmptyState title="イベントがありません" body="イベントが追加されると、ここに表示されます。" />
        )}
        {events && events.length > 0 && filteredEvents?.length === 0 && (
          <EmptyState
            title="条件に一致するイベントがありません"
            body="条件を変えてもう一度探してみてください。"
            action={
              <button className="outline-button" type="button" onClick={() => setFilters(emptyFilters)}>
                絞り込みを解除
              </button>
            }
          />
        )}
        {eventGroups.map((group) => (
          <section className="event-list-section" aria-labelledby={`event-list-${group.key}`} key={group.key}>
            <h2 className="event-list-section-title" id={`event-list-${group.key}`}>
              {group.title}
            </h2>
            {group.events.map((event) => (
              <Link
                className={`event-card${event.coverUrl ? "" : " no-cover"}`}
                to={`/events/${event.id}`}
                key={event.id}
                style={event.coverUrl ? { backgroundImage: `url(${event.coverUrl})` } : undefined}
              >
                <div className="event-card-badges">
                  {eventStatusLabel(event.startDate, event.endDate)}
                  <span className="event-media-count">{mediaCounts(event.photoCount, event.videoCount)}</span>
                </div>
                <div className="event-card-copy">
                  <h3>{event.title}</h3>
                  <p>{eventDate(event.startDate, event.endDate)}</p>
                </div>
              </Link>
            ))}
          </section>
        ))}
      </main>
      {filterOpen && (
        <div
          className={`modal-backdrop event-filter-backdrop${filterClosing ? " closing" : ""}`}
          onClick={closeFilters}
        >
          <section
            className="event-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-filter-title"
            onClick={(event) => event.stopPropagation()}
            onAnimationEnd={(event) => {
              if (!filterClosing || event.target !== event.currentTarget) return;
              setFilterOpen(false);
              setFilterClosing(false);
            }}
          >
            <header>
              <h2 id="event-filter-title">イベントを絞り込む</h2>
              <button className="icon-button" type="button" onClick={closeFilters} aria-label="閉じる">
                <X />
              </button>
            </header>
            <form
              className="event-filter-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (invalidRange) return;
                setFilters(draftFilters);
                closeFilters();
              }}
            >
              <label>
                キーワード
                <input
                  type="search"
                  value={draftFilters.keyword}
                  placeholder="タイトルやメモ"
                  onChange={(event) => setDraftFilters({ ...draftFilters, keyword: event.target.value })}
                />
              </label>
              <div className="date-row">
                <label>
                  期間の開始
                  <input
                    type="date"
                    value={draftFilters.from}
                    max={draftFilters.to || undefined}
                    onChange={(event) => setDraftFilters({ ...draftFilters, from: event.target.value })}
                  />
                </label>
                <label>
                  期間の終了
                  <input
                    type="date"
                    value={draftFilters.to}
                    min={draftFilters.from || undefined}
                    onChange={(event) => setDraftFilters({ ...draftFilters, to: event.target.value })}
                  />
                </label>
              </div>
              {invalidRange && (
                <p className="form-error" role="alert">
                  終了日は開始日以降にしてください。
                </p>
              )}
              <label>
                状態
                <select
                  value={draftFilters.status}
                  onChange={(event) =>
                    setDraftFilters({ ...draftFilters, status: event.target.value as EventFilters["status"] })
                  }
                >
                  <option value="all">すべて</option>
                  <option value="ongoing">進行中</option>
                  <option value="upcoming">予定</option>
                  <option value="undated">日付未定</option>
                  <option value="past">終了</option>
                </select>
              </label>
              <div className="event-filter-actions">
                <button className="outline-button" type="button" onClick={() => setDraftFilters(emptyFilters)}>
                  リセット
                </button>
                <button className="primary-button" type="submit" disabled={invalidRange}>
                  絞り込む
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export function filterEvents(events: EventSummary[], filters: EventFilters, today?: string): EventSummary[] {
  const keyword = filters.keyword.trim().toLocaleLowerCase();
  return events.filter((event) => {
    if (keyword && !`${event.title} ${event.description}`.toLocaleLowerCase().includes(keyword)) return false;
    if (filters.status !== "all" && eventTiming(event.startDate, event.endDate, today) !== filters.status) return false;
    if (filters.from || filters.to) {
      const firstDate = event.startDate ?? event.endDate;
      const lastDate = event.endDate ?? event.startDate;
      if (!firstDate || !lastDate) return false;
      if (filters.from && lastDate < filters.from) return false;
      if (filters.to && firstDate > filters.to) return false;
    }
    return true;
  });
}

export function groupEvents(events: EventSummary[], today?: string) {
  const groups = {
    current: [] as EventSummary[],
    undated: [] as EventSummary[],
    past: [] as EventSummary[],
  };
  events.forEach((event) => {
    const timing = eventTiming(event.startDate, event.endDate, today);
    if (timing === "ongoing" || timing === "upcoming") groups.current.push(event);
    else groups[timing].push(event);
  });
  return [
    { key: "current", title: "進行中・これから", events: groups.current },
    { key: "undated", title: "日付未定", events: groups.undated },
    { key: "past", title: "これまで", events: groups.past },
  ].filter((group) => group.events.length > 0);
}

function mediaCounts(photos: number, videos: number): string {
  return (
    [photos ? `写真${photos}枚` : "", videos ? `動画${videos}本` : ""].filter(Boolean).join(" · ") || "メディア0件"
  );
}

function eventStatusLabel(startDate: string | null, endDate: string | null) {
  const timing = eventTiming(startDate, endDate);
  if (timing === "ongoing") return <span className="event-status ongoing">進行中</span>;
  if (timing === "upcoming") return <span className="event-status upcoming">予定</span>;
  return null;
}

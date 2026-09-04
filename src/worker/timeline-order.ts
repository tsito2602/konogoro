export type TimelineOrderRow = {
  timeline_start_date: string;
  timeline_end_date: string;
  timeline_event_id: string;
  timeline_post_date: string;
  id: string;
};

export type TimelineCursor = Omit<TimelineOrderRow, "id"> & { id: string };

const startDate =
  "COALESCE(e.start_date, e.end_date, SUBSTR(COALESCE(p.captured_at, p.published_at, p.created_at), 1, 10))";
const endDate = `COALESCE(e.end_date, e.start_date, ${startDate})`;
const eventId = "COALESCE(p.event_id, p.id)";
const postDate = "COALESCE(p.captured_at, p.published_at, p.created_at)";

export const timelineOrderColumns = `${startDate} AS timeline_start_date,
         ${endDate} AS timeline_end_date,
         ${eventId} AS timeline_event_id,
         ${postDate} AS timeline_post_date`;

const orderTuple = `(${startDate}, ${endDate}, ${eventId}, ${postDate}, p.id)`;

export const timelineOrderBy = `${startDate} DESC, ${endDate} DESC, ${eventId} DESC, ${postDate} DESC, p.id DESC`;
export const timelineBeforeCursor = `${orderTuple} < (?, ?, ?, ?, ?)`;

export function parseTimelineCursor(value: string | undefined): TimelineCursor | null {
  if (!value) return null;
  const [timeline_start_date, timeline_end_date, timeline_event_id, timeline_post_date, id, ...rest] = value.split("|");
  if (rest.length > 0 || !timeline_start_date || !timeline_end_date || !timeline_event_id || !timeline_post_date || !id)
    return null;
  return { timeline_start_date, timeline_end_date, timeline_event_id, timeline_post_date, id };
}

export function serializeTimelineCursor(row: TimelineOrderRow): string {
  return [row.timeline_start_date, row.timeline_end_date, row.timeline_event_id, row.timeline_post_date, row.id].join(
    "|",
  );
}

export function timelineCursorValues(cursor: TimelineCursor): string[] {
  return [
    cursor.timeline_start_date,
    cursor.timeline_end_date,
    cursor.timeline_event_id,
    cursor.timeline_post_date,
    cursor.id,
  ];
}

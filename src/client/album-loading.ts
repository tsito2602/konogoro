import type { AlbumMedia } from "../shared/types";
import { api } from "./api";

export type AlbumMonthSummary = { key: string; count: number };
export type AlbumResponse = { media: AlbumMedia[]; nextCursor: string | null };

export function selectedAlbumPeriod(months: AlbumMonthSummary[], selected: string): string {
  if (selected.startsWith("all-")) {
    if (months.some((month) => month.key.startsWith(`${selected.slice(4)}-`))) return selected;
  } else if (months.some((month) => month.key === selected)) return selected;
  return months[0]?.key ?? "";
}

export function albumPath(period: string, cursor?: string | null): string {
  const params = new URLSearchParams(period.startsWith("all-") ? { year: period.slice(4) } : { month: period });
  if (cursor) params.set("cursor", cursor);
  return `/album?${params}`;
}

export function appendUniqueAlbumMedia(current: AlbumMedia[], incoming: AlbumMedia[]): AlbumMedia[] {
  const ids = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);
      return true;
    }),
  ];
}

// Restore only the selected period, and cancel the entire chain when the user switches periods.
export async function readAlbumPeriod(period: string, count: number, signal: AbortSignal): Promise<AlbumResponse> {
  const result = await api<AlbumResponse>(albumPath(period), { signal });
  const cursors = new Set<string>();
  while (result.media.length < count && result.nextCursor && !cursors.has(result.nextCursor)) {
    signal.throwIfAborted();
    cursors.add(result.nextCursor);
    const next = await api<AlbumResponse>(albumPath(period, result.nextCursor), { signal });
    result.media = appendUniqueAlbumMedia(result.media, next.media);
    result.nextCursor = next.nextCursor;
  }
  signal.throwIfAborted();
  return result;
}

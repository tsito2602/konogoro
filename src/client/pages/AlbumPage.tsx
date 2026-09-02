import { ChevronLeft, ChevronRight, Grid2X2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AlbumMedia } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";

type AlbumResponse = { media: AlbumMedia[]; nextCursor: string | null };

const monthFormatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "Asia/Tokyo" });
const yearMonthFormatter = new Intl.DateTimeFormat("en", { year: "numeric", month: "numeric", timeZone: "Asia/Tokyo" });

type AlbumMonth = { key: string; label: string; year: number; month: number; media: AlbumMedia[] };

export function AlbumPage() {
  const [media, setMedia] = useState<AlbumMedia[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");

  const load = () => {
    setError("");
    void api<AlbumResponse>("/album")
      .then((data) => {
        setMedia(data.media);
        setNextCursor(data.nextCursor);
      })
      .catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void api<AlbumResponse>("/album")
      .then((data) => {
        setMedia(data.media);
        setNextCursor(data.nextCursor);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const data = await api<AlbumResponse>(`/album?cursor=${encodeURIComponent(nextCursor)}`);
      setMedia((current) => (current ? appendUniqueAlbumMedia(current, data.media) : data.media));
      setNextCursor(data.nextCursor);
    } catch (reason) {
      setMoreError((reason as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = media ? groupAlbumMedia(media) : [];
  const selectedAllYear = selectedMonthKey.startsWith("all-") ? Number(selectedMonthKey.slice(4)) : null;
  const selectedMonth =
    groups.find((group) => group.key === selectedMonthKey) ?? (selectedAllYear ? undefined : groups[0]);
  const selectedYear = selectedAllYear ?? selectedMonth?.year;
  const years = [...new Set(groups.map((group) => group.year))];
  const selectedYearIndex = selectedYear ? years.indexOf(selectedYear) : -1;
  const months = selectedYear ? groups.filter((group) => group.year === selectedYear) : [];
  const allSelected = selectedYear !== undefined && selectedMonthKey === `all-${selectedYear}`;
  const selectYear = (year: number) => {
    const firstMonth = groups.find((group) => group.year === year);
    if (firstMonth) setSelectedMonthKey(allSelected ? `all-${year}` : firstMonth.key);
  };

  return (
    <main className="album-page page-content">
      {!media && !error && <Loading />}
      {error && <ErrorState message={error} retry={load} />}
      {media?.length === 0 && (
        <EmptyState title="まだ写真がありません" body="投稿した写真や動画が、撮影した月ごとに表示されます。" />
      )}
      {selectedYear && (
        <>
          <div className="album-picker-header">
            <div className="album-year-picker">
              <button
                type="button"
                onClick={() => selectYear(years[selectedYearIndex + 1])}
                disabled={selectedYearIndex >= years.length - 1}
                aria-label="前年を表示"
              >
                <ChevronLeft />
              </button>
              <strong>{selectedYear}</strong>
              <button
                type="button"
                onClick={() => selectYear(years[selectedYearIndex - 1])}
                disabled={selectedYearIndex <= 0}
                aria-label="翌年を表示"
              >
                <ChevronRight />
              </button>
            </div>
            <div className="album-month-picker" aria-label={`${selectedYear}年の月`}>
              <button
                className={`album-all-button${allSelected ? " active" : ""}`}
                type="button"
                onClick={() => setSelectedMonthKey(`all-${selectedYear}`)}
                aria-label={`${selectedYear}年をすべて表示`}
                aria-pressed={allSelected}
              >
                <Grid2X2 />
              </button>
              {months.map((group) => (
                <button
                  className={group.key === selectedMonth?.key ? "active" : ""}
                  type="button"
                  key={group.key}
                  onClick={() => setSelectedMonthKey(group.key)}
                  aria-pressed={group.key === selectedMonth?.key}
                >
                  <span>{group.month}</span>
                </button>
              ))}
            </div>
          </div>
          {allSelected ? (
            <section className="album-month" aria-label={`${selectedYear}年のすべて`}>
              <div className="album-grid">
                {months
                  .flatMap((group) => group.media)
                  .map((item) => (
                    <AlbumMediaLink item={item} key={item.id}>
                      <img src={item.thumbnailUrl} alt="" loading="lazy" />
                    </AlbumMediaLink>
                  ))}
              </div>
            </section>
          ) : (
            selectedMonth && (
              <section className="album-month" aria-label={selectedMonth.label}>
                <AlbumMediaLink item={selectedMonth.media[0]} className="album-cover">
                  <img src={selectedMonth.media[0].previewUrl} alt="" />
                  <span className="album-cover-label">
                    <strong>{selectedMonth.month}月</strong>
                    <small>{selectedMonth.year}</small>
                    <small>{selectedMonth.media.length}件の思い出</small>
                  </span>
                </AlbumMediaLink>
                {selectedMonth.media.length > 1 && (
                  <div className="album-grid">
                    {selectedMonth.media.slice(1).map((item) => (
                      <AlbumMediaLink item={item} key={item.id}>
                        <img src={item.thumbnailUrl} alt="" loading="lazy" />
                      </AlbumMediaLink>
                    ))}
                  </div>
                )}
              </section>
            )
          )}
        </>
      )}
      {media && nextCursor && (
        <div className="form-page">
          {moreError && (
            <p className="form-error" role="alert">
              {moreError}
            </p>
          )}
          <button className="outline-button wide" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "読み込み中…" : "さらに読み込む"}
          </button>
        </div>
      )}
    </main>
  );
}

function AlbumMediaLink({
  item,
  className,
  children,
}: {
  item: AlbumMedia;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={className}
      to={`/posts/${item.postId}/media/${item.id}`}
      state={{ returnToPrevious: true }}
      aria-label={`${new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric" }).format(new Date(item.capturedAt))}の投稿の${item.kind === "video" ? "動画" : "写真"}`}
    >
      {children}
      {item.kind === "video" && (
        <span className="media-play-mark" aria-hidden>
          ▶
        </span>
      )}
    </Link>
  );
}

export function groupAlbumMedia(media: AlbumMedia[]): AlbumMonth[] {
  const groups: AlbumMonth[] = [];
  for (const item of media) {
    const date = new Date(item.capturedAt);
    const parts = yearMonthFormatter.formatToParts(date);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const current = groups.at(-1);
    if (current?.key === key) current.media.push(item);
    else groups.push({ key, label: monthFormatter.format(date), year, month, media: [item] });
  }
  return groups;
}

export function appendUniqueAlbumMedia(current: AlbumMedia[], incoming: AlbumMedia[]): AlbumMedia[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

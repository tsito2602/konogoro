import { VideoBadge } from "../components/VideoBadge";
import { useReadingState } from "../reading-context";
import { ChevronLeft, ChevronRight, Grid2X2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { AlbumMedia } from "../../shared/types";
import { api } from "../api";
import {
  albumPath,
  appendUniqueAlbumMedia,
  readAlbumPeriod,
  selectedAlbumPeriod,
  type AlbumMonthSummary,
  type AlbumResponse,
} from "../album-loading";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageSkeleton, AlbumContentSkeleton } from "../components/PageSkeleton";

export { appendUniqueAlbumMedia } from "../album-loading";
const monthFormatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "Asia/Tokyo" });
const yearMonthFormatter = new Intl.DateTimeFormat("en", { year: "numeric", month: "numeric", timeZone: "Asia/Tokyo" });
type AlbumMonth = { key: string; label: string; year: number; month: number; media: AlbumMedia[] };

export function AlbumPage() {
  const [catalog, setCatalog] = useReadingState<AlbumMonthSummary[] | null>("albumMonths", null);
  const [selected, setSelected] = useReadingState("selectedMonthKey", "");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ months: AlbumMonthSummary[] }>("/album/months", { signal: controller.signal })
      .then(({ months }) => {
        if (!controller.signal.aborted) {
          setCatalog(months);
          setSelected((current) => selectedAlbumPeriod(months, current));
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [retry, setCatalog, setSelected]);
  const period = selectedAlbumPeriod(catalog ?? [], selected);
  const allYear = period.startsWith("all-");
  const year = Number(allYear ? period.slice(4) : period.slice(0, 4));
  const years = [...new Set((catalog ?? []).map((month) => Number(month.key.slice(0, 4))))];
  const months = (catalog ?? []).filter((month) => Number(month.key.slice(0, 4)) === year);
  const yearIndex = years.indexOf(year);
  const count = allYear
    ? months.reduce((sum, month) => sum + month.count, 0)
    : (months.find((month) => month.key === period)?.count ?? 0);
  const selectPeriod = (next: string) => {
    setSelected(next);
    window.scrollTo(0, 0);
  };
  const selectYear = (nextYear: number) => {
    const first = catalog?.find((month) => Number(month.key.slice(0, 4)) === nextYear);
    if (first) selectPeriod(allYear ? `all-${nextYear}` : first.key);
  };
  return (
    <main className="album-page page-content">
      {!catalog && !error && <PageSkeleton variant="album" />}
      {error && <ErrorState message={error} retry={() => setRetry((value) => value + 1)} />}
      {catalog?.length === 0 && (
        <EmptyState
          title="まだ写真がありません"
          body="投稿した写真や動画が、イベントの期間に合わせて月ごとに表示されます。"
        />
      )}
      {period && (
        <>
          <div className="album-picker-header">
            <div className="album-year-picker">
              <button
                type="button"
                onClick={() => selectYear(years[yearIndex + 1])}
                disabled={yearIndex >= years.length - 1}
                aria-label="前年を表示"
              >
                <ChevronLeft />
              </button>
              <strong>{year}</strong>
              <button
                type="button"
                onClick={() => selectYear(years[yearIndex - 1])}
                disabled={yearIndex <= 0}
                aria-label="翌年を表示"
              >
                <ChevronRight />
              </button>
            </div>
            <div className="album-month-picker" aria-label={`${year}年の月`}>
              <button
                className={`album-all-button${allYear ? " active" : ""}`}
                type="button"
                onClick={() => selectPeriod(`all-${year}`)}
                aria-label={`${year}年をすべて表示`}
                aria-pressed={allYear}
              >
                <Grid2X2 />
              </button>
              {months.map((month) => (
                <button
                  key={month.key}
                  className={month.key === period ? "active" : ""}
                  type="button"
                  onClick={() => selectPeriod(month.key)}
                  aria-label={`${year}年${Number(month.key.slice(5))}月を表示`}
                  aria-pressed={month.key === period}
                >
                  <span>{Number(month.key.slice(5))}</span>
                </button>
              ))}
            </div>
          </div>
          <AlbumPeriod key={period} period={period} count={count} />
        </>
      )}
    </main>
  );
}

function AlbumPeriod({ period, count }: { period: string; count: number }) {
  const [media, setMedia] = useReadingState<AlbumMedia[] | null>(`album-${period}-media`, null);
  const [nextCursor, setNextCursor] = useReadingState<string | null>(`album-${period}-cursor`, null);
  const [restoreCount] = useState(() => media?.length ?? 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const loading = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const allYear = period.startsWith("all-");
  const year = Number(allYear ? period.slice(4) : period.slice(0, 4));
  const month = Number(period.slice(5));
  const label = allYear ? `${year}年のすべて` : `${year}年${month}月`;
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    loading.current = true;
    void readAlbumPeriod(period, restoreCount, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setMedia(data.media);
          setNextCursor(data.nextCursor);
          setError("");
        }
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          loading.current = false;
          setBusy(false);
        }
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [period, restoreCount, retry, setMedia, setNextCursor]);
  const loadMore = useCallback(async () => {
    if (!nextCursor || loading.current) return;
    loading.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const data = await api<AlbumResponse>(albumPath(period, nextCursor), { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (data.nextCursor === nextCursor) throw new Error("続きの読み込みに失敗しました。もう一度お試しください。");
      setMedia((current) => appendUniqueAlbumMedia(current ?? [], data.media));
      setNextCursor(data.nextCursor);
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message);
    } finally {
      if (!controller.signal.aborted) {
        loading.current = false;
        setBusy(false);
      }
    }
  }, [period, nextCursor, setMedia, setNextCursor]);
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !nextCursor || busy || error || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [nextCursor, busy, error, loadMore]);
  return (
    <>
      {!media && !error && <AlbumContentSkeleton allYear={allYear} />}
      {!media && error && (
        <ErrorState
          message={error}
          retry={() => {
            setError("");
            setBusy(true);
            setRetry((value) => value + 1);
          }}
        />
      )}
      {media?.length === 0 && (
        <EmptyState kind="search" title="この期間の写真はありません" body="別の月や年を選んで思い出を探せます。" />
      )}
      {media && media.length > 0 && (
        <section className="album-month" aria-label={label}>
          {!allYear && (
            <AlbumMediaLink item={media[0]} viewerMedia={media} className="album-cover">
              <img src={media[0].previewUrl} alt="" />
              <span className="album-cover-label">
                <strong>{month}月</strong>
                <small>{year}</small>
                <small>{count}件の思い出</small>
              </span>
            </AlbumMediaLink>
          )}
          {(allYear || media.length > 1) && (
            <div className="album-grid skeleton-album-grid">
              {(allYear ? media : media.slice(1)).map((item) => (
                <AlbumMediaLink item={item} viewerMedia={media} key={item.id}>
                  <img src={item.thumbnailUrl} alt="" loading="lazy" />
                </AlbumMediaLink>
              ))}
              {busy &&
                nextCursor &&
                Array.from({ length: 6 }, (_, i) => (
                  <span className="skeleton-tile" key={`loading-${i}`} aria-hidden="true" />
                ))}
            </div>
          )}
        </section>
      )}
      {media && nextCursor && (
        <div className="album-load-more" ref={sentinel}>
          {error ? (
            <>
              <p className="form-error" role="alert">
                {error}
              </p>
              <button className="outline-button" type="button" onClick={() => void loadMore()}>
                再試行
              </button>
            </>
          ) : busy ? (
            <div role="status">写真・動画を読み込み中…</div>
          ) : !("IntersectionObserver" in window) ? (
            <button className="outline-button" type="button" onClick={() => void loadMore()}>
              さらに読み込む
            </button>
          ) : null}
        </div>
      )}
      {media && error && !nextCursor && (
        <ErrorState
          message={error}
          retry={() => {
            setError("");
            setBusy(true);
            setRetry((value) => value + 1);
          }}
        />
      )}
    </>
  );
}

function AlbumMediaLink({
  item,
  viewerMedia,
  className,
  children,
}: {
  item: AlbumMedia;
  viewerMedia: AlbumMedia[];
  className?: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  return (
    <Link
      className={className}
      to={`/posts/${item.postId}/media/${item.id}`}
      state={{ returnToPrevious: true, albumMedia: viewerMedia, albumOrigin: location.key }}
      data-reading-item={`media-${item.id}`}
      aria-label={`${new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric" }).format(new Date(item.capturedAt))}の投稿の${item.kind === "video" ? "動画" : "写真"}`}
    >
      {children}
      {item.kind === "video" && <VideoBadge durationSeconds={item.durationSeconds} />}
    </Link>
  );
}

export function groupAlbumMedia(media: AlbumMedia[]): AlbumMonth[] {
  const groups: AlbumMonth[] = [];
  for (const item of media) {
    const date = new Date(item.albumDate ?? item.capturedAt);
    const parts = yearMonthFormatter.formatToParts(date);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const current = groups.find((group) => group.key === key);
    if (current?.key === key) current.media.push(item);
    else groups.push({ key, label: monthFormatter.format(date), year, month, media: [item] });
  }
  return groups.sort((a, b) => b.key.localeCompare(a.key));
}

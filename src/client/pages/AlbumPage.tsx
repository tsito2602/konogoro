import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AlbumMedia } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

type AlbumResponse = { media: AlbumMedia[]; nextCursor: string | null };

const monthFormatter = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "Asia/Tokyo" });

export function AlbumPage() {
  const [media, setMedia] = useState<AlbumMedia[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = () => {
    setError("");
    void api<AlbumResponse>("/album").then((data) => {
      setMedia(data.media);
      setNextCursor(data.nextCursor);
    }).catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void api<AlbumResponse>("/album").then((data) => {
      setMedia(data.media);
      setNextCursor(data.nextCursor);
    }).catch((reason: Error) => setError(reason.message));
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setMoreError("");
    try {
      const data = await api<AlbumResponse>(`/album?cursor=${encodeURIComponent(nextCursor)}`);
      setMedia((current) => current ? appendUniqueAlbumMedia(current, data.media) : data.media);
      setNextCursor(data.nextCursor);
    } catch (reason) { setMoreError((reason as Error).message); }
    finally { setLoadingMore(false); }
  };

  return <>
    <PageHeader title="アルバム" />
    <main className="album-page page-content">
      {!media && !error && <Loading />}
      {error && <ErrorState message={error} retry={load} />}
      {media?.length === 0 && <EmptyState title="まだ写真がありません" body="投稿した写真や動画が、撮影した月ごとに表示されます。" />}
      {media && groupAlbumMedia(media).map((group) => <section className="album-month" key={group.label}>
        <h2>{group.label}<span>{group.media.length}</span></h2>
        <div className="album-grid">{group.media.map((item) => <Link to={`/posts/${item.postId}/media/${item.id}`} state={{ returnToPrevious: true }} key={item.id} aria-label={`${item.postTitle}の${item.kind === "video" ? "動画" : "写真"}`}>
          <img src={item.thumbnailUrl} alt="" loading="lazy" />
          {item.kind === "video" && <span className="media-play-mark" aria-hidden>▶</span>}
        </Link>)}</div>
      </section>)}
      {media && nextCursor && <div className="form-page">
        {moreError && <p className="form-error" role="alert">{moreError}</p>}
        <button className="outline-button wide" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "読み込み中…" : "さらに読み込む"}</button>
      </div>}
    </main>
  </>;
}

export function groupAlbumMedia(media: AlbumMedia[]): Array<{ label: string; media: AlbumMedia[] }> {
  const groups: Array<{ label: string; media: AlbumMedia[] }> = [];
  for (const item of media) {
    const label = monthFormatter.format(new Date(item.capturedAt));
    const current = groups.at(-1);
    if (current?.label === label) current.media.push(item);
    else groups.push({ label, media: [item] });
  }
  return groups;
}

export function appendUniqueAlbumMedia(current: AlbumMedia[], incoming: AlbumMedia[]): AlbumMedia[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

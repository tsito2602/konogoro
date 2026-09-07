import { ArrowUpRight } from "lucide-react";
import { eventDate } from "../api";

export function EventDraftPreview({
  title,
  startDate,
  endDate,
  coverUrl,
  coverPosition = { x: 50, y: 50 },
}: {
  title: string;
  startDate: string;
  endDate: string;
  coverUrl?: string;
  coverPosition?: { x: number; y: number };
}) {
  return (
    <figure className={`event-draft-preview${coverUrl ? " has-cover" : ""}`} aria-label="保存前のイベントプレビュー">
      {coverUrl && <img src={coverUrl} alt="" style={{ objectPosition: `${coverPosition.x}% ${coverPosition.y}%` }} />}
      <figcaption>
        <span className="event-draft-kicker">プレビュー</span>
        <p>{eventDate(startDate || null, endDate || null)}</p>
        <strong>{title.trim() || "イベントのタイトル"}</strong>
        <ArrowUpRight aria-hidden="true" />
      </figcaption>
    </figure>
  );
}

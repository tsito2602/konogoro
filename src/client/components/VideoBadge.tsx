import { Play } from "lucide-react";

export function formatVideoDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export function VideoBadge({ durationSeconds }: { durationSeconds?: number | null }) {
  const duration = formatVideoDuration(durationSeconds);
  return (
    <span className="video-duration-badge" aria-label={`動画${duration ? ` ${duration}` : "・長さ不明"}`}>
      <Play size={12} aria-hidden />
      {duration ?? "動画"}
    </span>
  );
}

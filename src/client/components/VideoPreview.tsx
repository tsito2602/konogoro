import { VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Media } from "../../shared/types";
import { useVideoPreparation } from "../video-experience";

const candidates = new Map<HTMLElement, (active: boolean) => void>();
let frame = 0;
function choosePreview() {
  frame = 0;
  let winner: HTMLElement | null = null;
  let distance = Infinity;
  for (const element of candidates.keys()) {
    const rect = element.getBoundingClientRect();
    const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const nextDistance = Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2);
    if (visible >= Math.min(rect.height, window.innerHeight) * 0.6 && nextDistance < distance) {
      winner = element;
      distance = nextDistance;
    }
  }
  // Pause every other element synchronously before requesting the chosen preview.
  for (const [element, setActive] of candidates) {
    if (element !== winner) {
      element.querySelector("video")?.pause();
      setActive(false);
    }
  }
  if (winner) candidates.get(winner)?.(true);
}
function schedulePreview() {
  if (!frame) frame = requestAnimationFrame(choosePreview);
}
function registerPreview(element: HTMLElement, setActive: (active: boolean) => void) {
  candidates.set(element, setActive);
  if (candidates.size === 1) {
    window.addEventListener("scroll", schedulePreview, { passive: true });
    window.addEventListener("resize", schedulePreview);
  }
  const observer = new IntersectionObserver(schedulePreview, { threshold: [0, 0.6, 1] });
  observer.observe(element);
  schedulePreview();
  return () => {
    observer.disconnect();
    element.querySelector("video")?.pause();
    candidates.delete(element);
    if (!candidates.size) {
      window.removeEventListener("scroll", schedulePreview);
      window.removeEventListener("resize", schedulePreview);
      cancelAnimationFrame(frame);
      frame = 0;
    } else schedulePreview();
  };
}
export function VideoPreview({ media }: { media: Media }) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);
  const allowed = useVideoPreparation() && media.playbackReady === true;
  useEffect(() => {
    if (!allowed || !ref.current || typeof IntersectionObserver === "undefined") return;
    return registerPreview(ref.current, setActive);
  }, [allowed]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && allowed) void video.play().catch(() => {});
    else video.pause();
  }, [active, allowed]);
  return (
    <div
      className="video-preview"
      ref={ref}
      style={{ aspectRatio: media.width && media.height && media.height > media.width ? "4 / 5" : "16 / 9" }}
    >
      <img src={media.thumbnailUrl} alt="" loading="lazy" />
      {active && allowed && (
        <span className="post-video-muted">
          <VolumeX aria-hidden />
          無音プレビュー
        </span>
      )}
      {active && allowed && (
        <video
          ref={videoRef}
          src={media.contentUrl}
          poster={media.thumbnailUrl}
          muted
          playsInline
          loop
          preload="none"
          aria-hidden
        />
      )}
    </div>
  );
}

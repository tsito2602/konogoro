import { useSyncExternalStore } from "react";
import type { Media } from "../shared/types";

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string; downlink?: number };
export function permitsVideoPreparation(connection?: Pick<Connection, "saveData" | "effectiveType" | "downlink">) {
  return (
    !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "") &&
    !(connection?.downlink !== undefined && connection.downlink < 1.5)
  );
}
function connection() {
  return (navigator as Navigator & { connection?: Connection }).connection;
}
function preparationAllowed() {
  return (
    !document.hidden &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    permitsVideoPreparation(connection())
  );
}
function subscribePreparation(callback: () => void) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const network = connection();
  document.addEventListener("visibilitychange", callback);
  motion.addEventListener("change", callback);
  network?.addEventListener("change", callback);
  return () => {
    document.removeEventListener("visibilitychange", callback);
    motion.removeEventListener("change", callback);
    network?.removeEventListener("change", callback);
  };
}
export function useVideoPreparation() {
  return useSyncExternalStore(subscribePreparation, preparationAllowed, () => false);
}

let identity: string | null = null;
let generation = 0;
type ResumePosition = { seconds: number; savedAt: number };
const positions = new Map<string, ResumePosition>();
const POSITION_STORAGE_PREFIX = "konogoro:video-positions:";
const POSITION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let positionWrite: ReturnType<typeof setTimeout> | undefined;
let lastPositionWrite = 0;
function positionKey(scope: string) {
  return `${POSITION_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}
function restorePositions(scope: string) {
  try {
    const raw = localStorage.getItem(positionKey(scope));
    if (!raw || raw.length > 32_000) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const row of parsed.slice(-MAX_POSITIONS)) {
      if (!Array.isArray(row) || row.length !== 2) continue;
      const [id, value] = row as [unknown, Partial<ResumePosition> | null];
      if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(id) || !value || typeof value !== "object") continue;
      if (
        typeof value.seconds !== "number" ||
        !Number.isFinite(value.seconds) ||
        value.seconds < 0 ||
        value.seconds > 86400
      )
        continue;
      if (
        typeof value.savedAt !== "number" ||
        !Number.isFinite(value.savedAt) ||
        Date.now() - value.savedAt > POSITION_TTL_MS ||
        value.savedAt > Date.now() + 60_000
      )
        continue;
      positions.set(id, { seconds: value.seconds, savedAt: value.savedAt });
    }
  } catch {
    /* Storage can be blocked or contain data from an older app version. */
  }
}
function flushPositions() {
  clearTimeout(positionWrite);
  positionWrite = undefined;
  if (!identity) return;
  try {
    localStorage.setItem(positionKey(identity), JSON.stringify([...positions]));
  } catch {
    /* Keep in-memory resume. */
  }
  lastPositionWrite = Date.now();
}
function schedulePositions() {
  if (Date.now() - lastPositionWrite >= 5000) flushPositions();
  else if (!positionWrite) positionWrite = setTimeout(flushPositions, 5000 - (Date.now() - lastPositionWrite));
}
const metrics = { starts: [] as number[], stalls: [] as number[], preloadHits: 0, preloadBytes: 0 };
const MAX_POSITIONS = 50;
export const MAX_VIDEO_PRELOAD_BYTES = 8 * 1024 * 1024;
let prepared: { id: string; blob: Blob } | null = null;
let preparing: AbortController | null = null;
let preparedExpiry: ReturnType<typeof setTimeout> | undefined;
const activeUrls = new Set<string>();
export function setVideoIdentity(next: string | null) {
  if (identity === next && next !== null) return;
  clearTimeout(positionWrite);
  positionWrite = undefined;
  try {
    if (identity) localStorage.removeItem(positionKey(identity));
    if (next === null) {
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const key = localStorage.key(index);
        if (key?.startsWith(POSITION_STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    }
  } catch {
    /* Storage is optional. */
  }
  identity = next;
  generation += 1;
  positions.clear();
  if (next) restorePositions(next);
  clearPreparedVideo();
  activeUrls.forEach((url) => URL.revokeObjectURL(url));
  activeUrls.clear();
  metrics.starts.length = 0;
  metrics.stalls.length = 0;
  metrics.preloadHits = 0;
  metrics.preloadBytes = 0;
  performance.clearMeasures("konogoro:video-start");
  performance.clearMeasures("konogoro:video-stall");
}
export function playbackMemory(mediaId: string) {
  const scope = generation;
  return {
    position: () => {
      const saved = scope === generation ? positions.get(mediaId) : undefined;
      return saved && Date.now() - saved.savedAt <= POSITION_TTL_MS ? saved.seconds : 0;
    },
    flush: () => {
      if (scope === generation) flushPositions();
    },
    save: (seconds: number, duration: number) => {
      if (
        !identity ||
        scope !== generation ||
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        seconds > 86400 ||
        !/^[a-zA-Z0-9_-]{1,160}$/.test(mediaId)
      )
        return;
      positions.delete(mediaId);
      if (!(Number.isFinite(duration) && duration - seconds < 1))
        positions.set(mediaId, { seconds, savedAt: Date.now() });
      if (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value!);
      schedulePositions();
    },
  };
}
export function recordVideoMetric(kind: "starts" | "stalls", start: number) {
  const end = performance.now();
  const samples = metrics[kind];
  samples.push(Math.max(0, end - start));
  if (samples.length > 32) samples.shift();
  // Fixed labels only: no media IDs, signed URLs, names or comment content.
  const label = `konogoro:video-${kind === "starts" ? "start" : "stall"}`;
  performance.clearMeasures(label);
  performance.measure(label, { start, end });
}
export function videoMetrics() {
  return { ...metrics, starts: [...metrics.starts], stalls: [...metrics.stalls] };
}
export function canPrepareVideo(media: Media | undefined): media is Media {
  return (
    media?.kind === "video" &&
    media.playbackReady === true &&
    typeof media.playbackByteSize === "number" &&
    media.playbackByteSize > 0 &&
    media.playbackByteSize <= MAX_VIDEO_PRELOAD_BYTES
  );
}
export function clearPreparedVideo() {
  clearTimeout(preparedExpiry);
  preparing?.abort();
  preparing = null;
  prepared = null;
}
// A complete small rendition is reused as a Blob, rather than hoping redirected signed ranges
// happen to be cached. Large renditions use ordinary playback and do not preload video bytes.
export function prepareNextVideo(media: Media) {
  clearPreparedVideo();
  if (!canPrepareVideo(media)) return () => {};
  const controller = new AbortController();
  const scope = generation;
  preparing = controller;
  const timer = setTimeout(() => controller.abort(), 3000);
  void (async () => {
    try {
      const response = await fetch(media.contentUrl, { signal: controller.signal });
      if (!response.ok || !response.body) return;
      const length = Number(response.headers.get("Content-Length"));
      if (length > MAX_VIDEO_PRELOAD_BYTES) {
        controller.abort();
        return;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_VIDEO_PRELOAD_BYTES) {
          await reader.cancel();
          controller.abort();
          return;
        }
        chunks.push(new Uint8Array(chunk.value));
      }
      if (controller.signal.aborted || scope !== generation || bytes !== media.playbackByteSize) return;
      prepared = { id: media.id, blob: new Blob(chunks, { type: "video/mp4" }) };
      preparedExpiry = setTimeout(() => {
        prepared = null;
      }, 15_000);
      metrics.preloadBytes = Math.min(Number.MAX_SAFE_INTEGER, metrics.preloadBytes + bytes);
    } catch {
      /* Speculative work must never block ordinary playback. */
    } finally {
      clearTimeout(timer);
      if (preparing === controller) preparing = null;
    }
  })();
  return () => {
    controller.abort();
    clearTimeout(timer);
    if (preparing === controller) preparing = null;
    // Keep the completed next item for the next player's mount; it is bounded to one Blob.
  };
}
export function takePreparedVideo(mediaId: string): { url: string; release: () => void } | null {
  if (prepared?.id !== mediaId) return null;
  clearTimeout(preparedExpiry);
  const url = URL.createObjectURL(prepared.blob);
  prepared = null;
  activeUrls.add(url);
  metrics.preloadHits += 1;
  return {
    url,
    release: () => {
      URL.revokeObjectURL(url);
      activeUrls.delete(url);
    },
  };
}

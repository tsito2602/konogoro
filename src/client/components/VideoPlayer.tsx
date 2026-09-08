import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { playbackMemory, recordVideoMetric, takePreparedVideo } from "../video-experience";

export function VideoPlayer({
  src,
  poster,
  mediaId = src,
  autoPlay = false,
  requestedAt,
  paused = false,
  onEnded,
  onPlaybackStarted,
  onNearEnd,
  viewerControls,
}: {
  src: string;
  poster: string;
  mediaId?: string;
  autoPlay?: boolean;
  requestedAt?: number;
  paused?: boolean;
  onEnded?: () => void;
  onPlaybackStarted?: () => void;
  onNearEnd?: () => void;
  viewerControls?: { container: HTMLElement | null; visible: boolean; toggle: () => void };
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "buffering" | "error">("idle");
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requested = useRef<number | null>(null);
  const stalled = useRef<number | null>(null);
  const hasPlayed = useRef(false);
  const memory = useMemo(() => playbackMemory(mediaId), [mediaId]);
  const stopStall = () => {
    if (stalled.current !== null) recordVideoMetric("stalls", stalled.current);
    stalled.current = null;
  };
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const prepared = takePreparedVideo(mediaId);
    video.src = prepared?.url ?? src;
    const save = () => memory.save(video.currentTime, video.duration);
    const hide = () => {
      if (document.hidden) video.pause();
      save();
      memory.flush();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    video.addEventListener("timeupdate", save);
    if (autoPlay && !document.hidden) {
      const now = performance.now();
      requested.current = requestedAt !== undefined && now - requestedAt < 10_000 ? requestedAt : now;
      void video.play().catch(() => {
        requested.current = null;
        setStatus("idle");
      });
    }
    return () => {
      save();
      memory.flush();
      video.pause();
      video.removeAttribute("src");
      video.load();
      prepared?.release();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
      video.removeEventListener("timeupdate", save);
    };
  }, [src, mediaId, memory, attempt, autoPlay, requestedAt]);
  useEffect(() => {
    if (paused) videoRef.current?.pause();
  }, [paused]);
  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    requested.current = performance.now();
    setStatus("loading");
    void video.play().catch(() => {
      requested.current = null;
      setStatus("idle");
    });
  };
  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    video.currentTime = Math.max(0, Math.min(duration, time));
    setPosition(video.currentTime);
  };
  const fullscreen = async () => {
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    const viewer = video?.closest<HTMLElement>(".media-viewer");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (viewer?.requestFullscreen) await viewer.requestFullscreen();
      else video?.webkitEnterFullscreen?.();
    } catch {
      /* Fullscreen can be unavailable in embedded browsers. */
    }
  };
  return (
    <div className="video-player">
      <video
        ref={videoRef}
        poster={poster}
        controls={!viewerControls && !paused}
        playsInline
        preload="none"
        draggable={false}
        onDurationChange={(event) =>
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)
        }
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const position = memory.position();
          if (position > 0 && Number.isFinite(video.duration) && position < video.duration - 1)
            video.currentTime = position;
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          setPosition(video.currentTime);
          if (!video.paused && video.duration - video.currentTime <= 10) onNearEnd?.();
        }}
        onPlay={(event) => {
          if (paused) {
            event.currentTarget.pause();
            return;
          }
          setPlaying(true);
          requested.current ??= performance.now();
          setStatus("loading");
        }}
        onPlaying={() => {
          if (requested.current !== null) recordVideoMetric("starts", requested.current);
          requested.current = null;
          stopStall();
          hasPlayed.current = true;
          setStatus("ready");
          onPlaybackStarted?.();
        }}
        onPause={() => {
          setPlaying(false);
          const video = videoRef.current;
          if (video) memory.save(video.currentTime, video.duration);
          memory.flush();
          requested.current = null;
          stopStall();
          setStatus((current) => (current === "error" ? current : "idle"));
        }}
        onWaiting={(event) => {
          if (event.currentTarget.paused || event.currentTarget.seeking) return;
          if (hasPlayed.current) stalled.current ??= performance.now();
          setStatus(hasPlayed.current ? "buffering" : "loading");
        }}
        onEnded={(event) => {
          setPlaying(false);
          memory.save(event.currentTarget.duration, event.currentTarget.duration);
          stopStall();
          setStatus("idle");
          onEnded?.();
        }}
        onError={() => {
          requested.current = null;
          stopStall();
          setStatus("error");
        }}
      />
      {viewerControls && !paused && (
        <button
          className="video-overlay-surface"
          type="button"
          aria-label={viewerControls.visible ? "操作表示を隠す" : "操作表示を表示する"}
          onClick={viewerControls.toggle}
        />
      )}
      {viewerControls?.container &&
        createPortal(
          <div
            className="viewer-video-controls"
            aria-label="動画の操作"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="viewer-video-buttons">
              <button
                type="button"
                aria-label="10秒戻す"
                disabled={paused || duration <= 0}
                onClick={() => seek(position - 10)}
              >
                <RotateCcw aria-hidden />
                <span>10</span>
              </button>
              <button
                type="button"
                aria-label={playing ? "一時停止" : "再生"}
                disabled={paused || status === "error"}
                onClick={() => (playing ? videoRef.current?.pause() : play())}
              >
                {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              </button>
              <button
                type="button"
                aria-label="10秒送る"
                disabled={paused || duration <= 0}
                onClick={() => seek(position + 10)}
              >
                <RotateCw aria-hidden />
                <span>10</span>
              </button>
              <button
                type="button"
                aria-label={muted ? "音声をオン" : "消音"}
                aria-pressed={muted}
                onClick={() => {
                  if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
                }}
              >
                {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
              </button>
              <button type="button" aria-label="全画面表示を切り替える" onClick={() => void fullscreen()}>
                <Maximize aria-hidden />
              </button>
            </div>
            <div className="viewer-video-seek">
              <span>{formatVideoTime(position)}</span>
              <input
                type="range"
                aria-label="再生位置"
                aria-valuetext={`${formatVideoTime(position)} / ${formatVideoTime(duration)}`}
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(position, duration)}
                disabled={paused || duration <= 0}
                onChange={(event) => seek(Number(event.target.value))}
              />
              <span>{formatVideoTime(duration)}</span>
            </div>
          </div>,
          viewerControls.container,
        )}
      {!viewerControls && status === "idle" && !paused && (
        <button className="video-play-button" type="button" onClick={play}>
          <Play aria-hidden />
          動画を再生
        </button>
      )}
      {["loading", "buffering", "error"].includes(status) && (!viewerControls || viewerControls.visible) && (
        <div className="video-player-status" role={status === "error" ? "alert" : "status"}>
          {status === "error" ? (
            <>
              <p>動画を再生できません。通信状態や動画の形式をご確認ください。</p>
              <button
                className="outline-button"
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setAttempt((value) => value + 1);
                }}
              >
                もう一度読み込む
              </button>
            </>
          ) : status === "loading" ? (
            "動画を読み込み中…"
          ) : (
            "再生を再開するために読み込み中…"
          )}
        </div>
      )}
    </div>
  );
}

export function formatVideoTime(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

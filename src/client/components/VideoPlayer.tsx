import { Play } from "lucide-react";
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
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "buffering" | "error">("idle");
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
  return (
    <div className="video-player">
      <video
        ref={videoRef}
        poster={poster}
        controls={!paused}
        playsInline
        preload="none"
        draggable={false}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const position = memory.position();
          if (position > 0 && Number.isFinite(video.duration) && position < video.duration - 1)
            video.currentTime = position;
        }}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (!video.paused && video.duration - video.currentTime <= 10) onNearEnd?.();
        }}
        onPlay={(event) => {
          if (paused) {
            event.currentTarget.pause();
            return;
          }
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
      {status === "idle" && !paused && (
        <button className="video-play-button" type="button" onClick={play}>
          <Play aria-hidden />
          動画を再生
        </button>
      )}
      {["loading", "buffering", "error"].includes(status) && (
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

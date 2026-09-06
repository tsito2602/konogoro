import { useState } from "react";

export function VideoPlayer({ src, poster }: { src: string; poster: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "buffering" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="video-player">
      <video
        key={attempt}
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        draggable={false}
        onLoadedMetadata={() => setStatus("ready")}
        onCanPlay={() => setStatus("ready")}
        onPlaying={() => setStatus("ready")}
        onWaiting={() => setStatus("buffering")}
        onError={() => setStatus("error")}
      />
      {status !== "ready" && (
        <div className="video-player-status" role={status === "error" ? "alert" : "status"}>
          {status === "error" ? (
            <>
              <p>動画を再生できません。通信状態や動画の形式をご確認ください。</p>
              <button
                className="outline-button"
                type="button"
                onClick={() => {
                  setStatus("loading");
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

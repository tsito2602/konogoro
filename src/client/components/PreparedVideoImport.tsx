import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { matchPreparedVideos, type PreparedPlayback } from "../video-playback";
import type { SelectedMediaFile } from "../media-upload";

export function PreparedVideoImport({
  files,
  disabled,
  onImport,
  onBusy,
}: {
  files: SelectedMediaFile[];
  disabled: boolean;
  onImport: (matches: Map<string, PreparedPlayback>) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const hashWorkerRef = useRef<Worker | null>(null);
  useEffect(() => () => hashWorkerRef.current?.terminate(), []);
  const select = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;
    setBusy(true);
    onBusy(true);
    setMessage("");
    setError("");
    try {
      const worker = new Worker(new URL("../video-hash.worker.ts", import.meta.url), { type: "module" });
      hashWorkerRef.current = worker;
      const matches = await matchPreparedVideos(
        chosen,
        files,
        (file) =>
          new Promise((resolve, reject) => {
            worker.onmessage = (event: MessageEvent<{ sha256: string; error?: string }>) =>
              event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.sha256);
            worker.onerror = () => reject(new Error("ファイルの確認に失敗しました。もう一度お試しください。"));
            worker.postMessage(file);
          }),
      );
      await onImport(matches);
      setMessage(`${matches.size}本の再生用動画を取り込みました。元動画と一緒に送信します。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "取り込みに失敗しました。");
    } finally {
      hashWorkerRef.current?.terminate();
      hashWorkerRef.current = null;
      setBusy(false);
      onBusy(false);
    }
  };
  if (!files.some((item) => item.file.type.startsWith("video/"))) return null;
  return (
    <div className="prepared-video-import">
      <button
        className="text-button"
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "動画の対応を確認中…" : "再生用動画を取り込む（任意）"}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept=".json,.mp4"
        disabled={disabled || busy}
        onChange={(event) => void select(event)}
      />
      <p className="selection-count">PCで準備した軽い動画がある場合に追加できます。</p>
      {message && (
        <p className="selection-count" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

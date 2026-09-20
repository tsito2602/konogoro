import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import type { Media } from "../../shared/types";
import { repairVideoThumbnail } from "../thumbnail-repair";

type Props = {
  media: Media[];
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onUpdated: (id: string, thumbnailUrl: string) => void;
};

export function VideoThumbnailRepair({ media, disabled, onBusy, onUpdated }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { text: string; error: boolean }>>({});
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const videos = media.filter((item) => item.kind === "video");
  if (!videos.length) return null;

  const regenerate = async (item: Media) => {
    if (disabled || controller.current) return;
    const operation = new AbortController();
    controller.current = operation;
    setActiveId(item.id);
    setMessages((current) => ({ ...current, [item.id]: { text: "動画から画像を作成しています…", error: false } }));
    onBusy(true);
    try {
      const url = await repairVideoThumbnail(item.id, operation.signal);
      if (operation.signal.aborted) return;
      onUpdated(item.id, url);
      setMessages((current) => ({ ...current, [item.id]: { text: "サムネイルを更新しました", error: false } }));
    } catch {
      if (operation.signal.aborted) return;
      setMessages((current) => ({
        ...current,
        [item.id]: {
          text: "再生成できませんでした。通信環境を確認して再試行してください。動画を読み込めない場合は別の端末でお試しください。",
          error: true,
        },
      }));
    } finally {
      controller.current = null;
      if (!operation.signal.aborted) {
        setActiveId(null);
        onBusy(false);
      }
    }
  };

  return (
    <section className="thumbnail-repair" aria-label="動画のサムネイル">
      <h2>動画のサムネイル</h2>
      <p className="muted">画像が表示されない動画は再生成できます。成功するとすぐに反映されます。</p>
      {videos.map((item) => (
        <div className="thumbnail-repair-item" key={item.id}>
          <span className="thumbnail-repair-name">{item.originalFilename}</span>
          <button
            type="button"
            className="outline-button"
            disabled={disabled || activeId !== null}
            aria-label={`${item.originalFilename}のサムネイルを再生成`}
            onClick={() => void regenerate(item)}
          >
            {activeId === item.id ? <LoaderCircle className="thumbnail-repair-spinner" /> : <RotateCcw />}
            {activeId === item.id ? "再生成中…" : "サムネイルを再生成"}
          </button>
          {messages[item.id] && (
            <p
              className={messages[item.id].error ? "form-error" : "muted"}
              role={messages[item.id].error ? "alert" : "status"}
            >
              {messages[item.id].text}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}

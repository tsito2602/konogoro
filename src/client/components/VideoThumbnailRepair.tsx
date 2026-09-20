import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";
import type { Media } from "../../shared/types";
import { repairVideoThumbnail } from "../thumbnail-repair";

type Props = {
  media: Media;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onUpdated: (id: string, thumbnailUrl: string) => void;
  onMessage: (message: { text: string; error: boolean }) => void;
};

export function VideoThumbnailRepair({ media, disabled, onBusy, onUpdated, onMessage }: Props) {
  const [active, setActive] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (media.kind !== "video") return null;
  const regenerate = async () => {
    if (disabled || controller.current) return;
    const operation = new AbortController();
    controller.current = operation;
    setActive(true);
    onMessage({ text: `${media.originalFilename}：サムネイルを再生成しています…`, error: false });
    onBusy(true);
    try {
      const url = await repairVideoThumbnail(media.id, operation.signal);
      if (operation.signal.aborted) return;
      onUpdated(media.id, url);
      onMessage({ text: `${media.originalFilename}：サムネイルを更新しました`, error: false });
    } catch {
      if (operation.signal.aborted) return;
      onMessage({
        text: `${media.originalFilename}：再生成できませんでした。通信環境を確認して再試行してください。動画を読み込めない場合は別の端末でお試しください。`,
        error: true,
      });
    } finally {
      controller.current = null;
      if (!operation.signal.aborted) {
        setActive(false);
        onBusy(false);
      }
    }
  };
  return (
    <button
      type="button"
      className="regenerate-selected-photo"
      disabled={disabled || active}
      aria-label={`${media.originalFilename}のサムネイルを再生成`}
      aria-busy={active}
      title="サムネイルを再生成"
      onClick={() => void regenerate()}
    >
      {active ? <LoaderCircle className="thumbnail-repair-spinner" aria-hidden /> : <RotateCcw aria-hidden />}
    </button>
  );
}

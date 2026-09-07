import { ArrowUp, ArrowDown } from "lucide-react";

export function SceneOrderButtons({
  title,
  index,
  count,
  disabled,
  onMove,
}: {
  title: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (offset: number) => void;
}) {
  return (
    <div className="scene-order-buttons">
      <button
        type="button"
        className="icon-button"
        aria-label={`見出し「${title}」を上へ移動`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={`見出し「${title}」を下へ移動`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown />
      </button>
    </div>
  );
}

export function moveScene<T>(items: T[], index: number, offset: number): T[] {
  const next = index + offset;
  if (next < 0 || next >= items.length) return items;
  const result = [...items];
  result.splice(next, 0, ...result.splice(index, 1));
  return result;
}

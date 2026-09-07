import { createContext } from "react";

export const PostModalContext = createContext(false);
let origin: { postId: string; photo: HTMLElement; trigger: HTMLElement } | null = null;

export function rememberPostOrigin(postId: string, card: HTMLElement, trigger: HTMLElement) {
  origin = { postId, photo: card.querySelector<HTMLElement>(".media-grid") ?? card, trigger };
}

export function postOrigin(postId: string) {
  return origin?.postId === postId && origin.photo.isConnected ? origin : null;
}

type Rect = { left: number; top: number; width: number; height: number };
export function modalTransform(source: Rect, target: Rect, width: number, height: number): string | null {
  if (
    source.width <= 0 ||
    source.height <= 0 ||
    target.width <= 0 ||
    target.height <= 0 ||
    source.top >= height ||
    source.top + source.height <= 0 ||
    source.left >= width ||
    source.left + source.width <= 0
  )
    return null;
  const scale = Math.min(1, source.width / target.width, source.height / target.height);
  const x = source.left + source.width / 2 - (target.left + target.width / 2);
  const y = source.top + source.height / 2 - (target.top + target.height / 2);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

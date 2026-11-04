import { createContext } from "react";

export const PostModalContext = createContext(false);
let origin: { postId: string; card: HTMLElement; photo: HTMLElement; trigger: HTMLElement } | null = null;

export function rememberPostOrigin(postId: string, card: HTMLElement, trigger: HTMLElement) {
  origin = { postId, card, photo: card.querySelector<HTMLElement>(".media-grid") ?? card, trigger };
}

export function postOrigin(postId: string) {
  return origin?.postId === postId && origin.photo.isConnected ? origin : null;
}

let editLeft: { postId: string; at: number } | null = null;

/** The post's edit page is closing; the post page under it shows at once instead of opening again. */
export function rememberEditLeft(postId: string) {
  editLeft = { postId, at: performance.now() };
}

/** Whether the post page is coming back from its edit page (taken once). */
export function takeEditLeft(postId: string) {
  const left = editLeft?.postId === postId && performance.now() - editLeft.at < 1000;
  editLeft = null;
  return left;
}

/** The card's box on screen, when it is still there to grow from or shrink back into. */
export function postOriginCard(postId: string): DOMRect | null {
  const found = postOrigin(postId);
  if (!found?.card.isConnected) return null;
  const box = found.card.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.top >= window.innerHeight) return null;
  return box;
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

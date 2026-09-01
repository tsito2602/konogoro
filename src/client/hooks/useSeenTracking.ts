import { useEffect, useRef } from "react";
import { api } from "../api";

export function useSeenTracking(postId: string) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    const key = `family-timeline:viewed:${postId}`;
    if (!element || sessionStorage.getItem(key)) return;
    let timer: number | undefined;
    let active = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        timer ??= window.setTimeout(() => {
          timer = undefined;
          observer.unobserve(element);
          void markPostSeen(postId, sessionStorage).then(() => {
            observer.disconnect();
          }).catch(() => {
            if (active) observer.observe(element);
          });
        }, 2000);
      } else if (timer) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0.5] });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); if (timer) window.clearTimeout(timer); };
  }, [postId]);

  return ref;
}

type SeenRequest = (path: string, init: RequestInit) => Promise<unknown>;

export async function markPostSeen(postId: string, storage: Pick<Storage, "setItem">, request: SeenRequest = api): Promise<void> {
  await request(`/posts/${postId}/view`, { method: "POST" });
  storage.setItem(`family-timeline:viewed:${postId}`, "1");
}

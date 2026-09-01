import { useEffect, useRef } from "react";
import { api } from "../api";

export function useSeenTracking(postId: string) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    const key = `family-timeline:viewed:${postId}`;
    if (!element || sessionStorage.getItem(key)) return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        timer ??= window.setTimeout(() => {
          sessionStorage.setItem(key, "1");
          void api(`/posts/${postId}/view`, { method: "POST" });
          observer.disconnect();
        }, 2000);
      } else if (timer) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0.5] });
    observer.observe(element);
    return () => { observer.disconnect(); if (timer) window.clearTimeout(timer); };
  }, [postId]);

  return ref;
}

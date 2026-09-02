import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export function useSeenTracking(postId: string, initiallyViewed = false) {
  const ref = useRef<HTMLElement>(null);
  const [viewed, setViewed] = useState(initiallyViewed);

  useEffect(() => {
    const element = ref.current;
    const key = `konogoro:viewed:${postId}`;
    if (!element || viewed || sessionStorage.getItem(key)) return;
    let timer: number | undefined;
    let active = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer ??= window.setTimeout(() => {
            timer = undefined;
            observer.unobserve(element);
            void markPostSeen(postId, sessionStorage)
              .then(() => {
                setViewed(true);
                observer.disconnect();
              })
              .catch(() => {
                if (active) observer.observe(element);
              });
          }, 2000);
        } else if (timer) {
          window.clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0.5] },
    );
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [postId, viewed]);

  return { ref, viewed };
}

type SeenRequest = (path: string, init: RequestInit) => Promise<unknown>;

export async function markPostSeen(
  postId: string,
  storage: Pick<Storage, "setItem">,
  request: SeenRequest = api,
): Promise<void> {
  await request(`/posts/${postId}/view`, { method: "POST" });
  storage.setItem(`konogoro:viewed:${postId}`, "1");
}

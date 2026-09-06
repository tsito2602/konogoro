import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

type SeenTrackingCallbacks = {
  onViewed?: () => void;
  onError?: (message: string) => void;
};

// Treat visibility as receipt of a post, never completion of every photo/video.
// Half of the smaller of the card and usable viewport can always be reached,
// even for a very tall card. Reserve room for the fixed header and bottom nav.
export function isPostVisible(rect: Pick<DOMRect, "top" | "bottom" | "left" | "right" | "height" | "width">) {
  const top = 80;
  const bottom = Math.max(top + 1, window.innerHeight - 100);
  const visibleHeight = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  return (
    rect.height > 0 &&
    rect.width > 0 &&
    visibleHeight >= Math.min(rect.height, bottom - top) / 2 &&
    visibleWidth >= Math.min(rect.width, window.innerWidth) / 2
  );
}

export function watchPostVisibility(element: HTMLElement, markSeen: () => void) {
  let timer: number | undefined;
  let finished = false;
  const clear = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };
  const check = () => {
    if (finished) return;
    if (document.visibilityState !== "visible" || !isPostVisible(element.getBoundingClientRect())) {
      clear();
      return;
    }
    timer ??= window.setTimeout(() => {
      timer = undefined;
      if (document.visibilityState !== "visible" || !isPostVisible(element.getBoundingClientRect())) return;
      finished = true;
      markSeen();
    }, 2000);
  };
  window.addEventListener("scroll", check, true);
  window.addEventListener("resize", check);
  document.addEventListener("visibilitychange", check);
  const observer = new IntersectionObserver(check, { threshold: [0, 0.5, 1] });
  observer.observe(element);
  const resizeObserver = new ResizeObserver(check);
  resizeObserver.observe(element);
  check();
  return () => {
    clear();
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("scroll", check, true);
    window.removeEventListener("resize", check);
    document.removeEventListener("visibilitychange", check);
  };
}

export function useSeenTracking(
  postId: string,
  initiallyViewed = false,
  callbacks: SeenTrackingCallbacks = {},
  enabled = true,
) {
  const ref = useRef<HTMLElement>(null);
  const [viewed, setViewed] = useState(initiallyViewed);
  const [recording, setRecording] = useState(false);
  const pending = useRef<Promise<void> | null>(null);
  const confirmed = useRef(initiallyViewed);
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const markViewed = useCallback((): Promise<void> => {
    if (confirmed.current) return Promise.resolve();
    if (pending.current) return pending.current;
    setRecording(true);
    pending.current = markPostSeen(postId)
      .then(() => {
        confirmed.current = true;
        setViewed(true);
        callbacksRef.current.onViewed?.();
      })
      .catch((reason: Error) => {
        callbacksRef.current.onError?.(reason.message);
        throw reason;
      })
      .finally(() => {
        pending.current = null;
        setRecording(false);
      });
    return pending.current;
  }, [postId]);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || viewed || initiallyViewed) return;
    return watchPostVisibility(element, () => {
      void markViewed().catch(() => undefined);
    });
  }, [enabled, initiallyViewed, viewed, markViewed]);

  return { ref, viewed: initiallyViewed || viewed, recording, markViewed };
}

type SeenRequest = (path: string, init: RequestInit) => Promise<unknown>;
const pendingViews = new Map<string, Promise<void>>();

export function markPostSeen(
  postId: string,
  storage?: Pick<Storage, "setItem">,
  request: SeenRequest = api,
): Promise<void> {
  const existing = pendingViews.get(postId);
  if (existing) return existing;
  const pending = request(`/posts/${postId}/view`, { method: "POST" })
    .then(() => {
      // Storage is only an optional cache; the server is authoritative on resume.
      try {
        (storage ?? sessionStorage).setItem(`konogoro:viewed:${postId}`, "1");
      } catch {
        /* unavailable */
      }
    })
    .finally(() => {
      pendingViews.delete(postId);
    });
  pendingViews.set(postId, pending);
  return pending;
}

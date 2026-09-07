import { setVideoIdentity } from "./video-experience";
import type { Post } from "../shared/types";
import { api } from "./api";
import { useCallback, useEffect, useLayoutEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";

type Position = { y: number; item?: string; offset?: number; index?: number };
type Entry = { values: Map<string, unknown>; position?: Position };
// In-memory and bounded: no personal content is persisted to device storage.
const entries = new Map<string, Entry>();
let readingIdentity: string | null = null;
let readingGeneration = 0;
let lastRoute: { key: string; pathname: string } | null = null;
let unreadExcursion: string | null = null;
export function setReadingIdentity(identity: string | null) {
  setVideoIdentity(identity);
  if (identity === readingIdentity) return;
  entries.clear();
  readingGeneration += 1;
  lastRoute = null;
  unreadExcursion = null;
  readingIdentity = identity;
}

export function isReadingExcursion(pathname: string): boolean {
  return /^\/posts\/[^/]+(?:\/media\/[^/]+)?$/.test(pathname) && pathname !== "/posts/new";
}
function trackReadingRoute(next: { key: string; pathname: string }) {
  if (lastRoute?.pathname === "/unread" && next.key !== lastRoute.key) {
    if (isReadingExcursion(next.pathname)) unreadExcursion = lastRoute.key;
    else entries.get(lastRoute.key)?.values.delete("unreadResponse");
  }
  if (unreadExcursion && !isReadingExcursion(next.pathname)) {
    if (next.pathname !== "/unread" || next.key !== unreadExcursion) {
      entries.get(unreadExcursion)?.values.delete("unreadResponse");
    }
    unreadExcursion = null;
  }
  lastRoute = next;
}

function entry(key: string): Entry {
  let value = entries.get(key);
  if (!value) {
    value = { values: new Map() };
    entries.set(key, value);
    if (entries.size > 40) entries.delete(entries.keys().next().value!);
  }
  return value;
}

export function useReadingState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const location = useLocation();
  const [key] = useState(location.key);
  const [generation] = useState(readingGeneration);
  const [value, setValue] = useState<T>(() => {
    const values = entry(key).values;
    return values.has(name) ? (values.get(name) as T) : initial;
  });
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((previous) => {
        if (generation !== readingGeneration) return previous;
        const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
        if (name !== "unreadResponse" || lastRoute?.key === key || unreadExcursion === key) {
          entry(key).values.set(name, value);
        }
        return value;
      });
    },
    [key, name, generation],
  );
  useEffect(() => {
    const refresh = () => {
      const values = entry(key).values;
      if (values.has(name)) setValue(values.get(name) as T);
    };
    window.addEventListener("reading-data-changed", refresh);
    return () => window.removeEventListener("reading-data-changed", refresh);
  }, [key, name]);
  return [value, set];
}

export function canReturnInApp(): boolean {
  return typeof window !== "undefined" && Number(window.history.state?.idx) > 0;
}

export function rememberAlbumMedia(key: string | undefined, mediaId: string, index?: number) {
  if (!key) return;
  const saved = entry(key);
  saved.position = { y: saved.position?.y ?? 0, item: `media-${mediaId}`, offset: 100, index };
}

export function removeReadingPost(postId: string) {
  for (const saved of entries.values()) {
    for (const [name, value] of saved.values) {
      if (Array.isArray(value)) {
        saved.values.set(
          name,
          value.filter((item) => item.id !== postId && item.postId !== postId),
        );
      } else if (name === "detail" && value && typeof value === "object" && "posts" in value) {
        const detail = value as { posts: { id: string }[] };
        saved.values.set(name, { ...detail, posts: detail.posts.filter((post) => post.id !== postId) });
      }
    }
  }
  window.dispatchEvent(new Event("reading-data-changed"));
}

export function restoredY(position: Position, items: { id: string; top: number }[], maximum: number): number {
  const target =
    items.find((item) => item.id === position.item) ??
    (position.index === undefined ? undefined : items[Math.min(position.index, items.length - 1)]);
  return Math.max(0, Math.min(maximum, target ? target.top - (position.offset ?? 0) : position.y));
}

export function ReadingPosition({ preserveWindow = false }: { preserveWindow?: boolean } = {}) {
  const location = useLocation();
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);
  useLayoutEffect(() => {
    trackReadingRoute({ key: location.key, pathname: location.pathname });
    if (preserveWindow) return;
    const saved = entry(location.key);
    const position = saved.position;
    let restoring = true;
    let frame = 0;
    const items = () => Array.from(document.querySelectorAll<HTMLElement>("[data-reading-item]"));
    const capture = () => {
      if (restoring) return;
      const all = items();
      const index = all.findIndex((item) => item.getBoundingClientRect().bottom > 90);
      const item = all[index];
      saved.position = {
        y: window.scrollY,
        item: item?.dataset.readingItem,
        offset: item?.getBoundingClientRect().top,
        index: index < 0 ? undefined : index,
      };
    };
    const restore = () => {
      if (!restoring) return;
      const all = items();
      const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = position
        ? restoredY(
            position,
            all.map((item) => ({
              id: item.dataset.readingItem!,
              top: item.getBoundingClientRect().top + window.scrollY,
            })),
            maximum,
          )
        : 0;
      window.scrollTo(0, y);
      // Revalidation or image loading can move an anchor after cached content first appears.
      // Keep restoring only until the user interacts or the bounded settling period ends.
      if (!position) restoring = false;
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(restore);
          });
    observer?.observe(document.documentElement);
    const mutations =
      position && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(restore);
          })
        : null;
    mutations?.observe(document.body, { childList: true, subtree: true });
    frame = requestAnimationFrame(restore);
    const stop = () => {
      restoring = false;
      capture();
    };
    const timeout = window.setTimeout(stop, 4000);
    window.addEventListener("scroll", capture, { passive: true });
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      window.removeEventListener("scroll", capture);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [location.key, location.pathname, preserveWindow]);
  return null;
}

export function restorePanelPosition(key: string, panel: HTMLElement, initial: () => void) {
  const values = entry(key).values;
  if (values.has("panelY")) panel.scrollTop = values.get("panelY") as number;
  else initial();
  const save = () => {
    values.set("panelY", panel.scrollTop);
  };
  panel.addEventListener("scroll", save, { passive: true });
  return () => {
    save();
    panel.removeEventListener("scroll", save);
  };
}

export async function readPages<R extends { nextCursor: string | null }>(
  path: string,
  field: keyof R,
  count: number,
): Promise<R> {
  const result = await api<R>(path);
  const rows: unknown[] = [];
  const ids = new Set<unknown>();
  const append = (items: unknown[]) => {
    for (const row of items) {
      if (row && typeof row === "object" && "id" in row) {
        if (ids.has(row.id)) continue;
        ids.add(row.id);
      }
      rows.push(row);
    }
  };
  append(result[field] as unknown as unknown[]);
  const cursors = new Set<string>();
  while (rows.length < count && result.nextCursor && !cursors.has(result.nextCursor)) {
    cursors.add(result.nextCursor);
    const next = await api<R>(`${path}?cursor=${encodeURIComponent(result.nextCursor)}`);
    append(next[field] as unknown as unknown[]);
    result.nextCursor = next.nextCursor;
  }
  return { ...result, [field]: rows };
}

export function updateReadingPost(post: Post) {
  for (const saved of entries.values()) {
    for (const [name, value] of saved.values) {
      if (name === "posts" && Array.isArray(value)) {
        saved.values.set(
          name,
          value.map((item) => (item.id === post.id ? post : item)),
        );
      } else if (
        (name === "detail" || name === "unreadResponse") &&
        value &&
        typeof value === "object" &&
        "posts" in value
      ) {
        const detail = value as { posts: Post[] };
        saved.values.set(name, { ...detail, posts: detail.posts.map((item) => (item.id === post.id ? post : item)) });
      }
    }
  }
  window.dispatchEvent(new Event("reading-data-changed"));
}

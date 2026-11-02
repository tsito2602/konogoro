import { useSyncExternalStore } from "react";

// 配信中の index.html を定期的に読み、読み込まれている入口スクリプトと違えば新しい配信があると判断する。
// サービスワーカーはメディアのキャッシュだけを持つため、開いたままのアプリは自分では新しくならない。
// 新しい配信は利用者が押したときだけ反映し、入力中の画面を勝手に読み直さない。

export type UpdateState = { available: boolean; version: string };

let state: UpdateState = { available: false, version: "" };
const listeners = new Set<() => void>();
const publish = (next: UpdateState) => {
  state = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useAppUpdate = () => useSyncExternalStore(subscribe, () => state);

const CHECK_INTERVAL = 30 * 60 * 1000;
const UPDATED_KEY = "konogoro-updated";

/** The built entry script (`/assets/index-<hash>.js`) of an index.html, or "" when there is none. */
export function entryScript(html: string): string {
  const tag = html.match(/<script\b[^>]*\btype="module"[^>]*>/i)?.[0] ?? "";
  return tag.match(/\bsrc="([^"]+)"/i)?.[1] ?? "";
}

/** The version a build writes into `<meta name="app-version">`. */
export function appVersionOf(html: string): string {
  return html.match(/<meta\s+name="app-version"\s+content="([^"]*)"/i)?.[1] ?? "";
}

/** Whether `latest` is another build than the page that is running. */
export function isNewBuild(current: string, latest: string): boolean {
  return Boolean(current && latest && current !== latest && latest.startsWith("/assets/"));
}

/** Shows the notice without a new build, for screenshots on localhost (`?preview-update=1.2.1`). */
function previewInDevelopment() {
  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return false;
  const version = new URLSearchParams(location.search).get("preview-update");
  if (version === null) return false;
  publish({ available: true, version });
  return true;
}

/** Looks for a new build on open, when the app comes back to the foreground and every 30 minutes. */
export function startUpdateChecks() {
  if (previewInDevelopment()) return () => {};
  const current = entryScript(document.documentElement.outerHTML);
  if (!current.startsWith("/assets/")) return () => {};
  let stopped = false;
  const check = async () => {
    if (stopped || state.available || document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const html = await response.text();
      if (!stopped && isNewBuild(current, entryScript(html))) publish({ available: true, version: appVersionOf(html) });
    } catch {
      /* オフラインなど。次の確認でもう一度試す。 */
    }
  };
  void check();
  const timer = window.setInterval(() => void check(), CHECK_INTERVAL);
  document.addEventListener("visibilitychange", check);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", check);
  };
}

/** Reloads into the new build and remembers to say so afterwards. */
export function applyUpdate() {
  try {
    sessionStorage.setItem(UPDATED_KEY, "1");
  } catch {
    /* 更新後のお知らせは無くても困らない。 */
  }
  location.reload();
}

/** True once, right after the reload that applyUpdate() started. */
export function takeUpdatedFlag(): boolean {
  try {
    const updated = sessionStorage.getItem(UPDATED_KEY) === "1";
    sessionStorage.removeItem(UPDATED_KEY);
    return updated;
  } catch {
    return false;
  }
}

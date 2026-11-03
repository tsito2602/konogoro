import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { spring } from "./cartoon/cartoon";

// kondo のページ遷移（kondo src/web/motion.ts）を移したもの。
// 前のページは 6px 浮いて 170ms で消え、次のページはフェードで現れ、その中の部品が下から上がる。
// ボトムナビのタブどうしはページを入れ替えたうえで部品だけを上げる（kondo のタブと同じ）。

const viewerPattern = /^\/posts\/[^/]+\/media\//;
let pendingLink: { pathname: string; dock: boolean; time: number } | null = null;

// 部品の出現は kondo のしおり（itinerary-screen.tsx の cascadeRows）と同じ。
// 画面に見えている行だけが 34px 下で 0.95 倍の大きさから、boing のばね（k420/d14）で 40ms ずつずれて上がる。
export const CASCADE_ROWS = [
  "[data-reading-item]",
  ".event-list-section-title",
  ".member-last-viewed",
  ".settings-section",
  ".settings-app-info",
  ".album-cover",
  ".album-month-heading",
  ".empty-state",
  ".error-state",
].join(", ");

export const reduceMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether a push from `from` to `to` cross-fades the page (the post sheet and the viewer keep their own motion). */
export function crossFades(
  from: string,
  to: string,
  options: { dock: boolean; replace?: boolean; postPage?: boolean },
) {
  if (options.dock || options.replace || options.postPage) return false;
  if (from === to) return false;
  return !viewerPattern.test(from) && !viewerPattern.test(to);
}

function pinSnapshot(side: "old" | "new") {
  const page = document.querySelector<HTMLElement>(".route-background");
  const bounds = page?.getBoundingClientRect();
  const root = document.documentElement.style;
  // スクロールした長いページを次のページの位置へ引き戻さないよう、各スナップショットを画面上の位置に固定する。
  root.setProperty(`--route-${side}-top`, `${bounds?.top ?? 0}px`);
  root.setProperty(`--route-${side}-left`, `${bounds?.left ?? 0}px`);
  root.setProperty(`--route-${side}-width`, `${bounds?.width ?? 0}px`);
  root.setProperty(`--route-${side}-height`, `${bounds?.height ?? 0}px`);
}

/** The rows of `scope`: the outermost CASCADE_ROWS matches, or the page's own blocks when it has none (forms). */
function rowsOf(scope: HTMLElement): HTMLElement[] {
  const matches = [
    ...(scope.matches(CASCADE_ROWS) ? [scope] : []),
    ...scope.querySelectorAll<HTMLElement>(CASCADE_ROWS),
  ].filter((element) => !element.parentElement?.closest(CASCADE_ROWS) || element === scope);
  if (matches.length) return matches;
  const blocks = scope.matches(".page-content") ? scope : scope.querySelector<HTMLElement>(".page-content");
  return blocks
    ? Array.from(blocks.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    : [scope];
}

/** kondo cascadeRows(): the rows in view rise in one by one. */
export function cascadeRows(rows: HTMLElement[]) {
  if (reduceMotion()) return;
  const height = window.innerHeight;
  rows
    .filter((row) => {
      const top = row.getBoundingClientRect().top;
      // 画面に留まる帯（保存バーなど）は動かさない。
      const position = getComputedStyle(row).position;
      return top < height + 20 && top > -200 && position !== "fixed" && position !== "sticky";
    })
    .forEach((row, index) =>
      spring(
        row,
        [
          { transform: "translateY(34px) scale(.95)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        "boing",
        { delay: 60 + index * 40, fill: "backwards" },
      ),
    );
}

/** A page that just came in: its rows cascade, or, while a skeleton stands in, the content does once it loads. */
export function markPageEnter() {
  const page = document.querySelector<HTMLElement>(".route-background");
  if (!page || page.querySelector(".page-skeleton")) return;
  cascadeRows(rowsOf(page));
}

/** Remembers the link a click is about to follow, so the router's navigate can tell a page link from a dock tab. */
export function rememberLinkClick(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.origin !== location.origin || (link.target && link.target !== "_self")) {
    pendingLink = null;
    return;
  }
  pendingLink = { pathname: link.pathname, dock: Boolean(link.closest(".main-dock-host, .tab-bar")), time: Date.now() };
}

type Navigate = (to: unknown, options?: Record<string, unknown>) => Promise<void>;

/**
 * Wraps the data router's navigate so a click on an ordinary page link runs as a view transition.
 * The router keeps the link's own state; only `viewTransition` is added.
 */
export function installRouteMotion(router: { navigate: Navigate }) {
  if (typeof document === "undefined") return;
  document.addEventListener("click", rememberLinkClick, true);
  const navigate = router.navigate.bind(router);
  router.navigate = (to, options) => {
    const link = pendingLink && Date.now() - pendingLink.time < 400 ? pendingLink : null;
    pendingLink = null;
    if (typeof to !== "string" || !link || !document.startViewTransition || reduceMotion())
      return navigate(to, options);
    const target = new URL(to, location.href).pathname;
    const state = options?.state as { postPage?: boolean } | null | undefined;
    if (
      target !== link.pathname ||
      !crossFades(location.pathname, target, {
        dock: link.dock,
        replace: Boolean(options?.replace),
        postPage: Boolean(state?.postPage),
      })
    )
      return navigate(to, options);
    pinSnapshot("old");
    document.documentElement.dataset.routeMotion = "";
    return navigate(to, { ...options, viewTransition: true });
  };
}

/** Runs inside the router's view-transition update: top of the new page, pin its snapshot, start the cascade. */
export function useRouteEnter() {
  const location = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    const root = document.documentElement;
    const crossFading = "routeMotion" in root.dataset;
    delete root.dataset.routeMotion;
    if (type !== "PUSH" || viewerPattern.test(location.pathname)) return;
    if ((location.state as { postPage?: boolean } | null)?.postPage) return;
    if (crossFading) {
      // 新しいページは先頭から見せる（読む位置の復元は次のフレームで同じ 0 に合わせる）。
      window.scrollTo(0, 0);
      pinSnapshot("new");
    }
    markPageEnter();
  }, [location.key, location.pathname, location.state, type]);
}

// A skeleton, or a wrapper whose own child is one. A whole page that leaves (a route change) does not count.
const isSkeleton = (node: Node) =>
  node instanceof HTMLElement &&
  (node.matches(".page-skeleton") || node.querySelector(":scope > .page-skeleton") !== null);

/** When a skeleton is replaced by the loaded content, the content's rows cascade in its place. */
export function installSkeletonReveal() {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver((records) => {
    if (reduceMotion()) return;
    const parents = new Set<Node>();
    for (const record of records) {
      const page = record.target instanceof Element && record.target.matches(".route-background, .app-shell, #root");
      if (!page && Array.from(record.removedNodes).some(isSkeleton)) parents.add(record.target);
    }
    for (const parent of parents) {
      const added = records
        .filter((record) => record.target === parent)
        .flatMap((record) => Array.from(record.addedNodes))
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node.isConnected && !isSkeleton(node));
      cascadeRows(added.flatMap((element) => (element.matches(CASCADE_ROWS) ? [element] : rowsOrSelf(element))));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function rowsOrSelf(element: HTMLElement): HTMLElement[] {
  const rows = Array.from(element.querySelectorAll<HTMLElement>(CASCADE_ROWS)).filter((row) => {
    const outer = row.parentElement?.closest(CASCADE_ROWS);
    return !outer || !element.contains(outer);
  });
  return rows.length ? rows : [element];
}

import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// kondo のページ遷移（kondo src/web/motion.ts）を移したもの。
// 前のページは 6px 浮いて 170ms で消え、次のページはフェードで現れ、その中の部品が少しずつずらして下から上がる。
// ボトムナビのタブどうしはページを入れ替えたうえで部品だけを上げる（kondo のタブと同じ）。

const viewerPattern = /^\/posts\/[^/]+\/media\//;
const ENTER_CLASS = "route-page-enter";
let enterTimer = 0;
let enterGeneration = 0;
// Content that replaced a skeleton while the page was rising: it runs only its own reveal, never page-rise too.
const revealedDuringEnter = new Set<HTMLElement>();
let pendingLink: { pathname: string; dock: boolean; time: number } | null = null;

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

/** The pieces of the page that just came in rise in a short stagger; the class goes once that is over. */
export function markPageEnter() {
  const page = document.querySelector<HTMLElement>(".route-background");
  if (!page || reduceMotion()) return;
  page.classList.remove(ENTER_CLASS);
  void page.offsetWidth;
  page.classList.add(ENTER_CLASS);
  window.clearTimeout(enterTimer);
  const generation = ++enterGeneration;
  // 上がっている途中の部品があれば、終わるのを待ってから外す（途中で外すと元の位置へ跳ぶ）。
  const finish = () => {
    if (generation !== enterGeneration) return;
    const rising = page
      .getAnimations({ subtree: true })
      .filter(
        (animation) => (animation as CSSAnimation).animationName === "page-rise" && animation.playState === "running",
      );
    if (rising.length) {
      void Promise.allSettled(rising.map((animation) => animation.finished)).then(finish);
      return;
    }
    page.classList.remove(ENTER_CLASS);
    for (const element of revealedDuringEnter) element.style.removeProperty("animation");
    revealedDuringEnter.clear();
  };
  enterTimer = window.setTimeout(finish, 1100);
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

/** Runs inside the router's view-transition update: top of the new page, pin its snapshot, start the stagger. */
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

/** The elements to raise where a skeleton went: the new siblings, or the rows of a single new list. */
export function revealTargets(added: HTMLElement[]): HTMLElement[] {
  if (added.length !== 1) return added;
  const rows = Array.from(added[0].children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  return rows.length > 1 ? rows : added;
}

/** When a skeleton is replaced by the loaded content, the content rises in its place in a short stagger. */
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
      // ページの上昇（CSS）と重なると、片方が終わったときにもう片方の途中の位置へ跳ぶ。中身は reveal だけで動かす。
      if (document.querySelector(`.route-background.${ENTER_CLASS}`))
        for (const element of [...added, ...revealTargets(added)]) {
          element.style.animation = "none";
          revealedDuringEnter.add(element);
        }
      revealTargets(added)
        .slice(0, 12)
        .forEach((element, index) =>
          element.animate?.(
            [
              { opacity: 0, transform: "translateY(8px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 420, delay: Math.min(index, 6) * 45, easing: "cubic-bezier(.22,.72,.18,1)", fill: "backwards" },
          ),
        );
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

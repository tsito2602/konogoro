import { useEffect } from "react";
import { Live, RM } from "./cartoon/cartoon";

// kondo src/web/jelly-scroll.ts をそのまま移したもの。
// Jelly scroll, as in kondo-itinerary.html and kondo-cartoon.html (section 3):
// a fast scroll leaves the items a little behind, and they settle on a spring.
// Each scroll step adds d × .55 to the lag (clamped to ±36 px, steps ≥ 120 px
// are jumps and add nothing); the lag springs back to 0 on k240 / d13. An item
// moves by lag × f × .9, where f is its distance down the visible area
// (0 at the top, 1 at the bottom), so the top holds and the bottom trails.
// Items more than 30 % above or 20 % below the visible area are left alone.

export type JellyOptions = {
  /** The scrolling element; the page itself (window) when omitted. */
  scroller?: HTMLElement | null;
  /** Skip while false, e.g. while the list's pane is hidden. */
  enabled?: () => boolean;
};

/** Starts jelly scroll on the items `items()` returns; returns a cleanup. */
export function jellyScroll(
  items: () => Iterable<HTMLElement>,
  { scroller = null, enabled = () => true }: JellyOptions = {},
) {
  const target: HTMLElement | Window = scroller ?? window;
  const top = () => (scroller ? scroller.scrollTop : window.scrollY);
  const view = () =>
    scroller
      ? {
          y: scroller.getBoundingClientRect().top + scroller.clientTop,
          h: scroller.clientHeight,
        }
      : { y: 0, h: window.innerHeight };
  // What this module set, so a moved item is measured where it would rest.
  const shift = new WeakMap<HTMLElement, number>();
  const touched = new Set<HTMLElement>();
  const place = (el: HTMLElement, px: number) => {
    if (px) {
      el.style.translate = `0 ${px.toFixed(2)}px`;
      shift.set(el, +px.toFixed(2));
      touched.add(el);
    } else if (shift.get(el)) {
      el.style.translate = "";
      shift.delete(el);
      touched.delete(el);
    }
  };
  const jelly = new Live(
    0,
    (v) => {
      const { y, h } = view();
      // Read every position before writing any, so a frame lays out once.
      const rows = [...items()].map((el) => ({
        el,
        f: (el.getBoundingClientRect().top - (shift.get(el) ?? 0) - y) / h,
      }));
      for (const { el, f } of rows) {
        if (f < -0.3 || f > 1.2) place(el, 0);
        else place(el, Math.abs(v) < 0.1 ? 0 : v * Math.max(0, f) * 0.9);
      }
    },
    { k: 240, d: 13 },
  );
  let lastTop = top();
  const onScroll = () => {
    const d = top() - lastTop;
    lastTop = top();
    if (!enabled()) return;
    if (!RM() && Math.abs(d) < 120) {
      jelly.v = Math.max(-36, Math.min(36, jelly.v + d * 0.55));
      void jelly.to(0);
    }
  };
  target.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    target.removeEventListener("scroll", onScroll);
    jelly.stop();
    for (const el of touched) el.style.translate = "";
    touched.clear();
  };
}

// このごろのページで、速いスクロールに少し遅れてついてくる部品。
// 写真の行・カード・設定の区切りが動き、固定される見出し（ヘッダー、年月）は動かさない。
export const PAGE_JELLY_ITEMS = [
  "[data-reading-item]",
  ".event-list-section-title",
  ".member-last-viewed",
  ".settings-section",
  ".settings-app-info",
  ".album-cover",
  ".album-month-heading",
  ".empty-state",
]
  .map((selector) => `.route-background:not([inert]) .page-content ${selector}`)
  .join(", ");

/** Jelly scroll on the routed page, on phones and tablets (the dock layout); a mouse wheel scrolls in steps. */
export function usePageJelly(active: boolean) {
  useEffect(() => {
    if (!active || typeof matchMedia !== "function") return;
    const dockLayout = matchMedia("(max-width: 1023px)");
    return jellyScroll(() => document.querySelectorAll<HTMLElement>(PAGE_JELLY_ITEMS), {
      enabled: () => dockLayout.matches,
    });
  }, [active]);
}

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Live, RM } from "../cartoon/cartoon";
import { CartoonDock } from "../cartoon/cartoon-dock";

/** The page the tabs last stood on (the post page closes back onto it). */
let lastTabsPath = "/";

/** The page under a post page (its dock is the one the post page closes back into). */
export const lastBasePath = () => lastTabsPath;

export type MainDockItem = { to: string; label: string; icon: ReactNode; end?: boolean };

/** The selection pill's two edges on two springs; moving right, the right edge leads (40 ms).
    Ported from kondo's trip-dock.tsx (cartoon-kit docs/DOCK.md). */
function edges(element: HTMLElement) {
  let left = 0;
  let right = 0;
  const draw = () => {
    element.style.left = `${Math.min(left, right)}px`;
    element.style.width = `${Math.abs(right - left)}px`;
  };
  return {
    L: new Live(0, (value) => ((left = value), draw())),
    R: new Live(0, (value) => ((right = value), draw())),
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    indicator: element,
  };
}
type Edges = ReturnType<typeof edges>;

function moveEdges(springs: Edges, left: number, right: number, animate: boolean) {
  clearTimeout(springs.timer);
  if (!animate || RM()) {
    springs.L.set(left);
    springs.R.set(right);
    return;
  }
  const rightward = left > springs.L.t;
  void (rightward ? springs.R : springs.L).to(rightward ? right : left, "lead");
  springs.timer = setTimeout(() => void (rightward ? springs.L : springs.R).to(rightward ? left : right, "split"), 40);
}

function isActive(item: MainDockItem, pathname: string) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** スマホ・タブレットのボトムナビ：cartoon-kit の親指ドック。家族の誰でも分かるよう、アイコンの下にページ名を出す。
    children を渡すと、タブの代わりにその画面の操作（DockGroup）を島にする。
    投稿ページはモーダルの中に自分のドックを置くが、島は前のドックの形から変形して続く（CartoonDock の carry）。 */
export function MainDock({
  items,
  measureRef,
  className,
  label = "メインナビゲーション",
  identity = "context",
  children,
}: {
  items: readonly MainDockItem[];
  measureRef?: (element: HTMLElement | null) => void;
  className?: string;
  label?: string;
  /** Which screen's controls these are; another screen's controls fade over while the islands morph. */
  identity?: string;
  children?: ReactNode;
}) {
  const { pathname: current } = useLocation();
  const showTabs = children == null;
  // A page with its own controls (the post page) turns back into the tabs as it closes: light the
  // tab of the page it returns to, so the next dock takes the same shape over without the pill
  // appearing afterwards.
  useEffect(() => {
    if (!className) lastTabsPath = current;
  }, [className, current]);
  const pathname = showTabs && className ? lastTabsPath : current;
  const active = items.findIndex((item) => isActive(item, pathname));
  const group = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const springs = useRef<Edges | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const node = group.current;
    const indicator = pill.current;
    if (!node || !indicator) return;
    if (springs.current?.indicator !== indicator) springs.current = edges(indicator);
    const place = (animate: boolean) => {
      const link = node.querySelectorAll<HTMLElement>("a")[active];
      if (!link) {
        springs.current!.L.set(0);
        springs.current!.R.set(0);
        return;
      }
      moveEdges(springs.current!, link.offsetLeft, link.offsetLeft + link.offsetWidth, animate);
    };
    // The first placement is instant; later moves run on the springs.
    place(placed.current && node.offsetWidth > 0);
    placed.current = node.offsetWidth > 0;
    let width = node.offsetWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (node.offsetWidth === width) return;
            width = node.offsetWidth;
            place(false);
            placed.current = width > 0;
          });
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [active, showTabs]);

  return (
    <nav ref={measureRef} className={`main-dock-host${className ? ` ${className}` : ""}`} aria-label={label}>
      <div className="thumb-dock">
        <CartoonDock identity={showTabs ? "tabs" : identity}>
          {children ?? (
            <div ref={group} className="cdock-group cdock-tabs" data-slot="tabs" data-full="">
              <span ref={pill} className="cdock-ind" aria-hidden="true" />
              {items.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  data-on={index === active}
                  draggable={false}
                  onClick={() => window.scrollTo(0, 0)}
                >
                  {item.icon}
                  <span className="main-dock-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </CartoonDock>
      </div>
    </nav>
  );
}

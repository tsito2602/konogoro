import { CalendarPlus, ImagePlus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Live, RM, spring } from "../cartoon/cartoon";

// uchiwake の＋メニュー（src/fuse-add-menu.tsx）を移したもの。
// ＋が退き、項目のアイコンが＋の位置から1つずつ（下から55msずつ）ばね k300/d15 で飛び出して着地し、
// 名前がアイコンの横から伸びる。後ろの画面は 0.94 倍に下がり、白い幕（ぼかし8px）がかかる。
// 閉じるときは同じ道を k420/d24 で40msずつ＋へ戻り、最後に＋が一度ふくらむ。

const OPEN = { k: 300, d: 15 };
const CLOSE = { k: 420, d: 24 };
const panelTiming: KeyframeAnimationOptions = { duration: 320, easing: "cubic-bezier(.32, 0, .2, 1)", fill: "both" };
const veilTiming: KeyframeAnimationOptions = { duration: 300, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" };

type Option = { to: string; label: string; icon: ReactNode };

export function FuseAddMenu({ postPath, close }: { postPath: string; close: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  const springs = useRef<Live[]>([]);
  const timers = useRef<number[]>([]);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  }, [close]);
  const addingToEvent = postPath !== "/posts/new";
  const options: Option[] = [
    { to: "/events/new", label: "イベント", icon: <CalendarPlus aria-hidden /> },
    {
      to: postPath,
      label: addingToEvent ? "このイベントに写真・動画" : "写真・動画",
      icon: <ImagePlus aria-hidden />,
    },
  ];

  useLayoutEffect(() => {
    const node = root.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const plus = document.querySelector<HTMLElement>(".floating-add-button")?.getBoundingClientRect();
    const list = node.querySelector<HTMLElement>(".fuse-add-options")!;
    // 一番下の項目のアイコンが＋のちょうど上に来るように置く。
    if (plus) {
      list.style.right = `${window.innerWidth - plus.right}px`;
      list.style.bottom = `${window.innerHeight - plus.bottom}px`;
      list.style.setProperty("--fuse-column", `${plus.width}px`);
    }
    const center = plus ? { x: plus.left + plus.width / 2, y: plus.top + plus.height / 2 } : null;
    const items = [...node.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const draws = items.map((item) => {
      const drop = item.querySelector<HTMLElement>(".fuse-drop")!;
      const label = item.querySelector<HTMLElement>(".fuse-label")!;
      const r = drop.getBoundingClientRect();
      const dx = center ? center.x - (r.left + r.width / 2) : 0;
      const dy = center ? center.y - (r.top + r.height / 2) : 0;
      return (v: number) => {
        const q = Math.max(0, v);
        const fly = `translate(${dx * (1 - q)}px, ${dy * (1 - q)}px)`;
        drop.style.opacity = String(Math.max(0, Math.min(1, (v - 0.55) * 3)));
        drop.style.transform = `${fly} scale(${Math.max(0.3, Math.min(1.2, v))})`;
        label.style.opacity = String(Math.max(0, Math.min(1, (v - 0.35) * 2.5)));
        label.style.transform = `${fly} scale(${Math.max(0.2, Math.min(1.15, v)).toFixed(4)}, ${Math.max(0.4, Math.min(1.1, 0.4 + v * 0.6)).toFixed(4)})`;
      };
    });
    springs.current = draws.map((draw) => new Live(0, draw, OPEN, 0.0005));
    draws.forEach((draw) => draw(0));
    if (!RM()) {
      const veil = node.querySelector<HTMLElement>(".fuse-add-veil")!;
      animations.current = [
        veil.animate(
          [
            { opacity: 0, backdropFilter: "blur(0px)" },
            { opacity: 1, backdropFilter: "blur(8px)" },
          ],
          veilTiming,
        ),
      ];
      const page = document.querySelector<HTMLElement>(".route-background");
      if (page) {
        const bounds = page.getBoundingClientRect();
        const origin = `${window.innerWidth / 2 - bounds.left}px ${window.innerHeight / 2 - bounds.top}px`;
        animations.current.push(
          page.animate(
            [
              { scale: "1", transformOrigin: origin },
              { scale: ".94", transformOrigin: origin },
            ],
            panelTiming,
          ),
        );
      }
    }
    const count = springs.current.length;
    springs.current.forEach((item, index) =>
      timers.current.push(window.setTimeout(() => void item.to(1), RM() ? 0 : (count - 1 - index) * 55)),
    );
    node.querySelector<HTMLElement>('[role="menu"]')?.focus({ preventScroll: true });
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      timers.current.forEach(clearTimeout);
      springs.current.forEach((item) => item.stop());
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    if (!closing) return;
    root.current!.inert = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    let active = true;
    const finish = () => {
      if (!active) return;
      active = false;
      closeRef.current();
      const plus = document.querySelector(".floating-add-button");
      if (plus) void spring(plus, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { k: 420, d: 12 });
    };
    if (RM()) {
      finish();
      return;
    }
    animations.current.forEach((animation) => {
      animation.playbackRate = -1.5;
      void animation.play();
    });
    const items = springs.current;
    items.forEach((item, index) => timers.current.push(window.setTimeout(() => void item.to(0, CLOSE), index * 40)));
    const check = window.setInterval(() => {
      if (items.every((item) => item.v < 0.02)) finish();
    }, 16);
    const timer = window.setTimeout(finish, 520);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(check);
    };
  }, [closing]);

  const dismiss = () => setClosing(true);
  return createPortal(
    <div
      className="fuse-add-overlay"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          dismiss();
        }
      }}
    >
      <div className="fuse-add-veil" onClick={dismiss} aria-hidden="true" />
      <div className="fuse-add-options" role="menu" aria-label="追加するものを選択" tabIndex={-1}>
        {options.map((option) => (
          <Link key={option.to} to={option.to} role="menuitem" data-feedback="none" onClick={() => closeRef.current()}>
            <span className="fuse-label">{option.label}</span>
            <i className="fuse-drop">{option.icon}</i>
          </Link>
        ))}
        <button type="button" className="visually-hidden" onClick={dismiss}>
          追加メニューを閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}

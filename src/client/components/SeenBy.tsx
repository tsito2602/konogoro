import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SeenUser } from "../../shared/types";
import { RM, spring } from "../cartoon/cartoon";
import { SeenIcon } from "./SeenIcon";

/** 画面の端と、上のヘッダー・下のドックに重ねないための余白。 */
const EDGE = 12;
const TOP_SAFE = 72;
const BOTTOM_SAFE = 104;
const GAP = 8;
const WIDTH = 264;

type Place = { left: number; top: number; maxHeight: number; below: boolean; originX: number };

export function SeenBy({ users }: { users: SeenUser[] }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const id = useId();

  const finish = useCallback(() => {
    closing.current = false;
    setOpen(false);
    setPlace(null);
  }, []);

  /** 開いた道を戻って目のアイコンへ縮む（k420/d24）。 */
  const close = useCallback(() => {
    const el = panel.current;
    if (!el || closing.current) return;
    closing.current = true;
    if (RM() || !el.animate) return finish();
    for (const row of el.querySelectorAll(".seen-panel-row")) row.getAnimations().forEach((a) => a.cancel());
    const below = el.dataset.below === "true";
    void spring(
      el,
      [
        { transform: "none", opacity: 1 },
        { transform: `translateY(${below ? -10 : 10}px) scale(.4)`, opacity: 0 },
      ],
      { k: 420, d: 24 },
      { fill: "forwards" },
    ).then(finish);
  }, [finish]);

  // 開く場所は目のアイコンの上。上に入らないときは下に出す。
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(WIDTH, vw - EDGE * 2);
    const left = Math.min(Math.max(rect.right - width, EDGE), vw - width - EDGE);
    const above = rect.top - GAP - TOP_SAFE;
    const under = vh - BOTTOM_SAFE - rect.bottom - GAP;
    const want = 92 + users.length * 48;
    // 全員が入るほうを選ぶ。どちらにも入らないときは広いほうに出して中でスクロールする。
    const below = above < want && (under >= want || under > above);
    const maxHeight = Math.max(below ? under : above, 140);
    setPlace({
      left,
      top: below ? rect.bottom + GAP : rect.top - GAP,
      maxHeight,
      below,
      originX: rect.left + rect.width / 2 - left,
    });
  }, [open, users.length]);

  // 目のアイコンからふくらんで出て、人の行が下から順に上がる。目は一度まばたきする。
  useLayoutEffect(() => {
    const el = panel.current;
    if (!place || !el) return;
    void spring(
      el,
      [
        { transform: `translateY(${place.below ? -12 : 12}px) scale(.3)`, opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: "none", opacity: 1 },
      ],
      "boing",
    );
    el.querySelectorAll(".seen-panel-row").forEach((row, i) =>
      spring(
        row,
        [
          { transform: "translateY(14px) scale(.92)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        "boing",
        { delay: 60 + i * 40, fill: "backwards" },
      ),
    );
    const eyes = button.current?.querySelector(".seen-icon");
    if (eyes) void spring(eyes, [{ transform: "scaleY(.15)" }, { transform: "none" }], "boing");
  }, [place]);

  // 外を押す、Esc、スクロール、画面の大きさが変わったときに閉じる。
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      button.current?.focus({ preventScroll: true });
    };
    const startY = window.scrollY;
    const scroll = () => {
      if (Math.abs(window.scrollY - startY) > 24) close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  if (users.length === 0)
    return (
      <span className="seen-by-empty" aria-label="見た人 0人">
        <SeenIcon />
        <span>0</span>
      </span>
    );

  return (
    <span className="seen-by">
      <button
        ref={button}
        type="button"
        className="seen-by-button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`見た人 ${users.length}人、一覧を${open ? "閉じる" : "表示"}`}
        data-haptic
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SeenIcon />
        <span>{users.length}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={`見た人 ${users.length}人`}
            className="seen-panel"
            data-below={place?.below ? "true" : "false"}
            style={
              place
                ? {
                    left: place.left,
                    top: place.top,
                    maxHeight: place.maxHeight,
                    transformOrigin: `${place.originX}px ${place.below ? "0" : "100%"}`,
                    translate: place.below ? undefined : "0 -100%",
                  }
                : { visibility: "hidden" }
            }
          >
            <header className="seen-panel-head">
              <SeenIcon />
              <strong>見た人</strong>
              <span className="seen-panel-count">{users.length}人</span>
            </header>
            <p className="seen-panel-note">投稿が画面に表示された人</p>
            <ul className="seen-panel-list">
              {users.map((user) => (
                <li className="seen-panel-row" key={user.id}>
                  <span className="seen-user-avatar" aria-hidden>
                    {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}
                  </span>
                  <span className="seen-panel-name">{user.displayName}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </span>
  );
}

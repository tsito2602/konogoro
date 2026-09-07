import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Check, Images, Moon, Sun, X } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useCurrentUser } from "../components/AppLayout";
import { TactileSwitch } from "../components/TactileSwitch";
import { moveItemByOffset, useMediaReorder } from "../hooks/useMediaReorder";
import "../tactile.css";

const photos = [
  { id: "lake", name: "湖のほとり", image: "/demo/lake.jpg" },
  { id: "forest", name: "木漏れ日の道", image: "/demo/forest.jpg" },
  { id: "journey", name: "帰り道の空", image: "/demo/journey.jpg" },
];

function EventPreview({
  origin,
  close,
  reduceMotion,
}: {
  origin: HTMLButtonElement;
  close: () => void;
  reduceMotion: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const closing = useRef(false);
  const reduced = useCallback(
    () => reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [reduceMotion],
  );
  const collapsedTransform = useCallback(
    (dialog: HTMLDialogElement) => {
      const from = origin.getBoundingClientRect();
      const to = dialog.getBoundingClientRect();
      return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    },
    [origin],
  );
  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    if (!reduced()) {
      animationRef.current = dialog.animate(
        [
          { transform: collapsedTransform(dialog), opacity: 0.65 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 340, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
    }
    return () => {
      animationRef.current?.cancel();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (origin.isConnected) origin.focus({ preventScroll: true });
    };
  }, [origin, collapsedTransform, reduced]);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    animationRef.current?.cancel();
    const dialog = dialogRef.current;
    if (!dialog || reduced()) return close();
    const animation = dialog.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: collapsedTransform(dialog), opacity: 0 },
      ],
      { duration: 240, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
    );
    animationRef.current = animation;
    animation.finished.then(close).catch(() => {
      /* Route changes cancel the visual only. */
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="tactile-event-dialog"
      aria-labelledby="sample-event-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <article>
        <div className="tactile-event-hero">
          <img src={photos[0].image} alt="山々が映る静かな湖" />
          <button className="tactile-close" type="button" aria-label="イベントを閉じる" onClick={dismiss}>
            <X />
          </button>
          <div>
            <span>SEPTEMBER / 2026</span>
            <h2 id="sample-event-title">湖のそばで、ひと休み。</h2>
          </div>
        </div>
        <div className="tactile-event-story">
          <span className="tactile-eyebrow">ある週末の記録</span>
          <p>
            少し遠回りして、深呼吸。
            <br />
            何でもない時間も、残しておきたくなる。
          </p>
          <div className="tactile-story-photos">
            {photos.slice(1).map((photo) => (
              <img key={photo.id} src={photo.image} alt={photo.name} />
            ))}
          </div>
          <span className="tactile-note">サンプルの思い出</span>
        </div>
      </article>
    </dialog>
  );
}

function Playground() {
  const [dark, setDark] = useState(false);
  const [motionReduced, setMotionReduced] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [order, setOrder] = useState(photos.map((photo) => photo.id));
  const [eventOrigin, setEventOrigin] = useState<HTMLButtonElement | null>(null);
  const { gridRef, announcement } = useMediaReorder(order, setOrder, false, motionReduced);
  return (
    <div className="tactile-playground" data-tactile-theme={dark ? "dark" : "light"} data-reduce-motion={motionReduced}>
      <div className="tactile-topline">
        <Link to="/settings">
          <ArrowLeft size={18} />
          設定へ
        </Link>
        <span>このごろ / DESIGN STUDY 01</span>
      </div>
      <header className="tactile-intro">
        <div>
          <span className="tactile-eyebrow">日々のひとこまを、もっと心地よく。</span>
          <h1>
            思い出に、
            <br />
            <span>触れてみる。</span>
          </h1>
          <p>
            開く。並べる。そっと届く。
            <br />
            いつもの操作に、小さな楽しさを。
          </p>
        </div>
        <div className="tactile-options">
          <button type="button" onClick={() => setDark(!dark)} aria-pressed={dark}>
            {dark ? <Moon size={18} /> : <Sun size={18} />}
            {dark ? "ダーク" : "ライト"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={motionReduced}
              onChange={(event) => setMotionReduced(event.target.checked)}
            />
            動きを減らす
          </label>
        </div>
      </header>
      <div className="tactile-studies">
        <section className="tactile-study tactile-study-event">
          <div className="tactile-study-heading">
            <span>01 / OPEN</span>
            <span>ひらく</span>
          </div>
          <div className="tactile-book-stack">
            {photos.slice(1).map((photo) => (
              <img
                key={photo.id}
                className="tactile-book-peek"
                src={photo.image}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            ))}
            <button
              type="button"
              className="tactile-book"
              aria-label="サンプルのイベントを開く"
              onClick={(event) => setEventOrigin(event.currentTarget)}
            >
              <img src={photos[0].image} alt="山と湖の風景" />
              <div className="tactile-book-copy">
                <span>2026.09.05 — 09.06</span>
                <h2>
                  湖のそばで、
                  <br />
                  ひと休み。
                </h2>
                <span>
                  <Images size={14} />
                  3枚の思い出
                  <ArrowRight size={20} />
                </span>
              </div>
            </button>
          </div>
          <p className="tactile-caption">表紙に触れると、あの日がひらく。</p>
        </section>
        <div className="tactile-study-side">
          <section className="tactile-study tactile-study-arrange">
            <div className="tactile-study-heading">
              <span>02 / ARRANGE</span>
              <span>ならべる</span>
            </div>
            <div className="tactile-photo-tray" ref={gridRef}>
              {order.map((id, index) => {
                const photo = photos.find((item) => item.id === id)!;
                return (
                  <div
                    key={id}
                    data-reduce-motion={motionReduced}
                    className="tactile-print selected-photo"
                    data-media-id={id}
                    tabIndex={0}
                    role="group"
                    aria-label={`${photo.name}、${index + 1}番目。矢印キーで並び替え`}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                      event.preventDefault();
                      setOrder(
                        moveItemByOffset(order, index, event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1),
                      );
                    }}
                  >
                    <img src={photo.image} alt={photo.name} draggable={false} />
                    <span aria-hidden="true">0{index + 1}</span>
                  </div>
                );
              })}
            </div>
            <p className="tactile-caption">写真を長押しして、好きな順番に。</p>
            <span className="visually-hidden" role="status">
              {announcement}
            </span>
          </section>
          <section className="tactile-study tactile-study-notify">
            <div className="tactile-study-heading">
              <span>03 / CONNECT</span>
              <span>とどく</span>
            </div>
            <div className="tactile-notify-row">
              <div>
                <h2>家族のこのごろ。</h2>
                <p>新しい思い出を、LINEで。</p>
              </div>
              <TactileSwitch checked={enabled} onChange={setEnabled} />
            </div>
            <div className="tactile-delivery" data-on={enabled} aria-hidden="true">
              <img src="/icons/icon-light-192.png" alt="" />
              <div>
                <strong>このごろ</strong>
                <span>新しい思い出が届きました。</span>
              </div>
              <Check size={16} />
            </div>
            <p className="tactile-caption" role="status">
              {enabled ? "オン · 届くときの、小さなよろこび。" : "オフ · 自分のペースで、のぞきに行く。"}
            </p>
          </section>
        </div>
      </div>
      <footer className="tactile-footer">
        <ArrowDown size={16} />
        <p>ステージング限定の試作です。写真・通知はサンプルで、変更は保存されません。</p>
        <span>0.36 / PROTOTYPE</span>
      </footer>
      {eventOrigin && (
        <EventPreview origin={eventOrigin} reduceMotion={motionReduced} close={() => setEventOrigin(null)} />
      )}
    </div>
  );
}

export function DesignPlaygroundPage() {
  const user = useCurrentUser();
  return user.isStaging ? <Playground /> : <Navigate to="/settings" replace />;
}

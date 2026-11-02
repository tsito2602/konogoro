import { useEffect, useLayoutEffect, useRef } from "react";
import packageInfo from "../../../package.json";
import { applyUpdate, takeUpdatedFlag, useAppUpdate } from "../app-update";
import { anim, RM, spring } from "../cartoon/cartoon";
import { useToast } from "./Toast";

/** kondo の更新のお知らせ：新しい配信があるあいだ、ボトムナビの上に黒い丸い帯を浮かべる。 */
export function UpdateNotice() {
  const { available, version } = useAppUpdate();
  const notify = useToast();
  const pill = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (takeUpdatedFlag()) notify(`アップデートしました · ${packageInfo.version}`, { success: true });
  }, [notify]);

  // 着地して少しつぶれる（cartoon-kit の sink と同じ形）。
  useLayoutEffect(() => {
    if (!available || !pill.current || RM()) return;
    void anim(
      pill.current,
      [
        { transform: "translateY(18px) scale(.9,1.12)", opacity: 0 },
        { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
        { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
        { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(.4,0,.6,1)" },
    );
  }, [available]);

  useLayoutEffect(() => {
    if (!available) return;
    // ＋ボタンとトーストはお知らせの上へ移る。
    const root = document.documentElement;
    root.dataset.appUpdate = "waiting";
    return () => {
      delete root.dataset.appUpdate;
    };
  }, [available]);

  if (!available) return null;
  const label = version && version !== packageInfo.version ? version : "新しいバージョン";
  return (
    <div className="update-notice-host">
      <button
        type="button"
        ref={pill}
        className="update-notice"
        data-feedback="none"
        aria-label={`アップデートがあります。このごろ ${label}。更新する`}
        onClick={async (event) => {
          if (document.documentElement.dataset.unsavedChanges === "true") {
            notify("入力中の内容を保存するか破棄してから更新できます");
            return;
          }
          await spring(event.currentTarget, [{ transform: "scale(.94)" }, { transform: "none" }], "squish");
          const screen = document.querySelector<HTMLElement>(".route-background");
          if (screen)
            await anim(
              screen,
              [
                { opacity: 1, filter: "blur(0)" },
                { opacity: 0, filter: "blur(6px)" },
              ],
              { duration: 260, fill: "forwards" },
            );
          applyUpdate();
        }}
      >
        <span className="update-notice-spark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 3l2 6.2L20 12l-6 2.8L12 21l-2-6.2L4 12l6-2.8z" fill="currentColor" />
          </svg>
        </span>
        <span className="update-notice-text" aria-hidden="true">
          <b>アップデートがあります</b>
          <small>このごろ {label}</small>
        </span>
        <span className="update-notice-action" aria-hidden="true">
          更新する
        </span>
      </button>
    </div>
  );
}

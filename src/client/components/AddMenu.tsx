import { CalendarPlus, ImagePlus, X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";

export function AddMenu({ postPath, close }: { postPath: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const animation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const addingToEvent = postPath !== "/posts/new";
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector("a")?.focus({ preventScroll: true });
    return () => {
      animation.current?.cancel();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, []);
  const dismiss = () => {
    if (closing.current) return;
    const dialog = ref.current;
    if (!dialog?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return close();
    closing.current = true;
    animation.current = dialog.animate(
      [
        { opacity: 1, scale: "1" },
        { opacity: 0, scale: ".97" },
      ],
      {
        duration: 140,
        easing: "ease-in",
        fill: "forwards",
      },
    );
    animation.current.finished.then(close).catch(() => {});
  };
  return (
    <dialog
      ref={ref}
      className="add-menu add-menu-dialog"
      aria-label="追加するものを選択"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dismiss();
      }}
    >
      <header>
        <strong>追加する</strong>
        <button className="icon-button" type="button" aria-label="追加メニューを閉じる" onClick={dismiss}>
          <X />
        </button>
      </header>
      <Link to={postPath} onClick={close}>
        <ImagePlus aria-hidden />
        <span>
          <strong>{addingToEvent ? "このイベントに写真・動画" : "写真・動画"}</strong>
          <small>{addingToEvent ? "表示中のイベントを選択して投稿" : "思い出を投稿する"}</small>
        </span>
      </Link>
      <Link to="/events/new" onClick={close}>
        <CalendarPlus aria-hidden />
        <span>
          <strong>イベント</strong>
          <small>旅行やお出かけを作る</small>
        </span>
      </Link>
    </dialog>
  );
}

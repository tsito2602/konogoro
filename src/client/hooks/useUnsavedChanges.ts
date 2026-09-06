import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

/** Files stay in memory; neither browser history nor persistent storage can restore File objects. */
export function useUnsavedChanges(dirty: boolean, busy = false) {
  const saved = useRef(false);
  const blocker = useBlocker(() => !saved.current && (dirty || busy));
  useEffect(() => {
    if (!dirty && !busy) return;
    document.documentElement.dataset.unsavedChanges = "true";
    const warn = (event: BeforeUnloadEvent) => {
      if (saved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      delete document.documentElement.dataset.unsavedChanges;
      // Let the destination render before applying a deferred app update.
      window.setTimeout(() => window.dispatchEvent(new Event("konogoro-draft-settled")), 0);
    };
  }, [dirty, busy]);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (busy) {
      window.alert("送信・保存中です。完了するまでこの画面でお待ちください。");
      blocker.reset();
    } else if (window.confirm("入力内容と選択した写真・動画は保存されません。この画面を離れますか？")) {
      blocker.proceed();
    } else blocker.reset();
  }, [blocker, busy]);
  return () => {
    saved.current = true;
  };
}

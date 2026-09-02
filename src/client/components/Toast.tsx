import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const ToastContext = createContext<((message: string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const nextId = useRef(0);
  const timer = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setToast({ id: nextId.current++, message });
    timer.current = window.setTimeout(() => {
      setToast(null);
      timer.current = null;
    }, 2800);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div className="toast" key={toast.id} role="status" aria-live="polite">
          <Check aria-hidden />
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) throw new Error("useToast must be used within ToastProvider");
  return showToast;
}

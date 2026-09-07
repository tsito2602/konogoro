const controlSelector = 'button, a[href], input, select, textarea, label, [role="button"], [role="tab"], summary';
const unavailableSelector = ':disabled, [aria-disabled="true"], [aria-busy="true"], [inert], [data-feedback="none"]';

function pressTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  let control = target.closest<HTMLElement>(controlSelector);
  if (!control || control.closest(unavailableSelector)) return null;
  // Native fields keep their own focus/selection feedback. Only choice/file labels press.
  if (control.matches("input")) {
    if (!control.matches('[type="checkbox"], [type="radio"], [type="file"]')) return null;
    control = (control as HTMLInputElement).labels?.[0] ?? control;
  }
  if (control.matches("select, textarea")) return null;
  if (control instanceof HTMLLabelElement) {
    if (!control.control?.matches('input[type="checkbox"], input[type="radio"], input[type="file"]')) return null;
    if (control.control.matches(unavailableSelector)) return null;
  }
  // Drag handles already have their own lift/placement feedback.
  if (control.closest("[data-scene-handle], .media-drag-preview, .scene-drag-preview")) return null;
  return control;
}

/** One delegated listener set also covers menus/portals and newly loaded cards. */
export function initializeInteractionFeedback() {
  document.documentElement.setAttribute("data-input-method", "pointer");
  let pressed: HTMLElement | null = null;
  let pointer: { id: number; x: number; y: number; bounds: DOMRect } | null = null;
  let key: string | null = null;
  const reset = () => {
    pressed?.removeAttribute("data-feedback-pressed");
    pressed = null;
    pointer = null;
    key = null;
  };
  const down = (event: PointerEvent) => {
    document.documentElement.setAttribute("data-input-method", "pointer");
    reset();
    if (!event.isPrimary || event.button !== 0) return;
    pressed = pressTarget(event.target);
    if (!pressed) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, bounds: pressed.getBoundingClientRect() };
    pressed.setAttribute("data-feedback-pressed", "");
  };
  const move = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const { bounds, x, y } = pointer;
    if (
      !pressed?.isConnected ||
      Math.hypot(event.clientX - x, event.clientY - y) > 8 ||
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      reset();
  };
  const up = (event: PointerEvent) => {
    if (pointer?.id === event.pointerId) reset();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!event.altKey && !event.ctrlKey && !event.metaKey && !["Shift", "Control", "Alt", "Meta"].includes(event.key))
      document.documentElement.setAttribute("data-input-method", "keyboard");
    if (event.key === "Escape") return reset();
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !["Enter", " "].includes(event.key)) return;
    const target = pressTarget(event.target);
    if (!target || (event.key === " " && target.matches("a[href]"))) return;
    reset();
    pressed = target;
    key = event.key;
    pressed.setAttribute("data-feedback-pressed", "");
  };
  const keyUp = (event: KeyboardEvent) => {
    if (event.key === key) reset();
  };
  const focusOut = () => {
    if (key) reset();
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointercancel", reset, true);
  document.addEventListener("lostpointercapture", reset, true);
  document.addEventListener("scroll", reset, true);
  document.addEventListener("keydown", keyDown, true);
  document.addEventListener("keyup", keyUp, true);
  document.addEventListener("focusout", focusOut, true);
  document.addEventListener("visibilitychange", reset);
  window.addEventListener("blur", reset);
  return () => {
    document.documentElement.removeAttribute("data-input-method");
    reset();
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", reset, true);
    document.removeEventListener("lostpointercapture", reset, true);
    document.removeEventListener("scroll", reset, true);
    document.removeEventListener("keydown", keyDown, true);
    document.removeEventListener("keyup", keyUp, true);
    document.removeEventListener("focusout", focusOut, true);
    document.removeEventListener("visibilitychange", reset);
    window.removeEventListener("blur", reset);
  };
}

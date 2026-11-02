import { RM, squishDown, squishUp } from "./cartoon/cartoon";

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

/** cartoon-kit の「押すとつぶれる」（scale 2-v, v）の量。押した要素そのものに一致する最初の行を使い、
    入れ子では最も内側の操作だけをつぶす。1 は形を変えない（読む文や選択の面）。 */
const squishAmounts: [selector: string, amount: number][] = [
  [
    ".notification-toggle, .theme-setting label, .role-guide label, .text-button, .more-comments-link, .comment-count-link, .post-caption, .post-comment-preview, p a",
    1,
  ],
  [".floating-add-button, .desktop-add-button", 0.88],
  [".icon-button", 0.9],
  [
    ".event-card, .media-cell, .album-grid a, .album-cover, .thumbnail-strip a, .thumbnail-strip button, .post-head, .settings-menu-row, .photo-add, .cover-grid button",
    0.97,
  ],
];
const defaultSquish = 0.95;

function squishAmount(control: HTMLElement) {
  for (const [selector, amount] of squishAmounts) if (control.matches(selector)) return amount;
  return defaultSquish;
}

function canSquish(control: HTMLElement) {
  return typeof requestAnimationFrame === "function" && "style" in control && !RM();
}

/** One delegated listener set also covers menus/portals and newly loaded cards. */
export function initializeInteractionFeedback() {
  document.documentElement.setAttribute("data-input-method", "pointer");
  let pressed: HTMLElement | null = null;
  let pointer: { id: number; x: number; y: number; bounds: DOMRect } | null = null;
  let key: string | null = null;
  const press = (control: HTMLElement) => {
    pressed = control;
    control.setAttribute("data-feedback-pressed", "");
    const amount = squishAmount(control);
    if (amount < 1 && canSquish(control)) void squishDown(control, amount);
  };
  const reset = () => {
    if (pressed && canSquish(pressed)) void squishUp(pressed);
    pressed?.removeAttribute("data-feedback-pressed");
    pressed = null;
    pointer = null;
    key = null;
  };
  const down = (event: PointerEvent) => {
    document.documentElement.setAttribute("data-input-method", "pointer");
    reset();
    if (!event.isPrimary || event.button !== 0) return;
    const target = pressTarget(event.target);
    if (!target) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, bounds: target.getBoundingClientRect() };
    press(target);
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
    key = event.key;
    press(target);
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

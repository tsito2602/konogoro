// kondo src/web/haptics.ts をそのまま移したもの（元は tsito2602/uchino）。A light tick under the finger.
//
// iPhone has no vibration API: Safari plays its system tick only when a real
// tap toggles a native `<input type="checkbox" switch>`; a switch toggled from
// script stays silent. A switch laid over a control, though, grabs the touch
// (it can be dragged), so a scroll that starts on the control is lost and
// releasing it still presses the control.
//
// Every tappable control therefore carries a transparent <label> over its
// surface, holding a hidden switch the finger never touches. A label is an
// ordinary surface: a drag that starts on it scrolls, and only a real tap
// clicks it. The tap toggles the switch through the label (that ticks), and
// only then is the press handed to the control, so a control that re-renders
// or disappears on press cannot remove the switch before it has ticked.
//
// Android ticks through the Vibration API instead, which only has a length,
// so the pulse is kept short and reserved for confirmed actions (a submitted
// form, a ticked task, or any control marked `data-haptic`), not navigation.

export const ios =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)));

const tappable = "button,a[href],[role=button],[role=menuitem],[role=tab],[role=option],[role=switch],[role=checkbox]";

export function haptic() {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(5);
  } catch {
    /* Haptics are a nicety only. */
  }
}

/** The label's and switch's own clicks must be ignored by document listeners. */
export const isHapticTouch = (target: EventTarget | null) =>
  target instanceof Element && target.classList.contains("haptic-touch");

function equip(host: HTMLElement) {
  const own = host.querySelectorAll<HTMLElement>(":scope > .haptic-touch");
  // React may duplicate or wipe the label when it rewrites a control's text.
  if (own.length > 1) for (const label of own) label.remove();
  else if (own.length) return;
  if (host.closest("[data-no-haptic]") || host.matches("input, select, textarea, label, [contenteditable]")) return;
  const label = document.createElement("label");
  label.className = "haptic-touch";
  label.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.className = "haptic-touch";
  label.appendChild(input);
  let pressed = false;
  // Neither the label's click nor the switch's own click is the control's.
  label.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target === label) pressed = true;
  });
  // The native change event fires once the toggle (and its tick) is complete.
  input.addEventListener("change", () => {
    if (!pressed) return;
    pressed = false;
    host.click();
  });
  host.setAttribute("data-haptic-host", "");
  host.appendChild(label);
}

export function installHaptics() {
  if (typeof document === "undefined") return;
  if (ios) {
    // The label's own (real) tap already presses a submit button that holds
    // it, and the hand-off presses it again: one form would be sent twice
    // (Tsubasa 2026-10-07: 1回の追加で2件). Let only the first through.
    const sent = new WeakMap<EventTarget, number>();
    document.addEventListener(
      "submit",
      (event) => {
        const form = event.target;
        if (!form) return;
        const last = sent.get(form);
        if (last !== undefined && event.timeStamp - last < 700) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        sent.set(form, event.timeStamp);
      },
      true,
    );
    let queued = false;
    const scan = () => {
      queued = false;
      for (const host of document.querySelectorAll<HTMLElement>(tappable)) equip(host);
    };
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(scan);
    }).observe(document.body, { childList: true, subtree: true });
    scan();
    return;
  }
  document.addEventListener("submit", haptic, true);
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-haptic]:not(:disabled)")) haptic();
    },
    true,
  );
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node's EventTarget has no DOM capture phase; normalize capture for listener removal.
class EventBus extends EventTarget {
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
    super.addEventListener(type, callback);
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null) {
    super.removeEventListener(type, callback);
  }
}

// Only the DOM surface used by delegated feedback is needed in the node test environment.
class Control extends EventTarget {
  attributes = new Map<string, string>();
  isConnected = true;
  parent: Control | null = null;
  constructor(public tag = "button") {
    super();
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  matches(selectors: string): boolean {
    return selectors.split(",").some((part) => {
      const selector = part.trim();
      if (selector === ":disabled") return this.attributes.has("disabled");
      const match = selector.match(/^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
      if (match)
        return (
          (!match[1] || match[1] === this.tag) &&
          this.attributes.has(match[2]) &&
          (match[3] === undefined || this.attributes.get(match[2]) === match[3])
        );
      if (selector.startsWith(".")) return (this.attributes.get("class") ?? "").split(" ").includes(selector.slice(1));
      return selector === this.tag;
    });
  }
  closest(selectors: string): Control | null {
    return this.matches(selectors) ? this : (this.parent?.closest(selectors) ?? null);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 100 };
  }
}
class Input extends Control {
  labels: Label[] = [];
  checked = false;
  constructor(type: string) {
    super("input");
    this.setAttribute("type", type);
  }
}
class Label extends Control {
  control: Input | null = null;
  constructor() {
    super("label");
  }
}
function emit(bus: EventTarget, name: string, target?: Control, props: Record<string, unknown> = {}) {
  const event = new Event(name, { cancelable: true });
  for (const [key, value] of Object.entries({ ...(target ? { target } : {}), ...props }))
    Object.defineProperty(event, key, { value });
  bus.dispatchEvent(event);
  return event;
}
function pointer(bus: EventTarget, name: string, target: Control, props: Record<string, unknown> = {}) {
  return emit(bus, name, target, { isPrimary: true, button: 0, pointerId: 1, clientX: 50, clientY: 50, ...props });
}

let feedback: typeof import("./interaction-feedback");
let doc: EventTarget;
let view: EventTarget;
let dispose: (() => void) | undefined;
beforeEach(async () => {
  vi.resetModules();
  doc = new EventBus();
  view = new EventBus();
  vi.stubGlobal("window", view);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("Element", Control);
  vi.stubGlobal("HTMLInputElement", Input);
  vi.stubGlobal("HTMLLabelElement", Label);
  feedback = await import("./interaction-feedback");
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("委譲された押下フィードバック", () => {
  beforeEach(() => {
    dispose = feedback.initializeInteractionFeedback();
  });
  it("入れ子の内側だけを反応させ、通常タップでは既定動作を抑止しない", () => {
    const outer = new Control("a");
    outer.setAttribute("href", "/events");
    const button = new Control();
    button.parent = outer;
    const icon = new Control("svg");
    icon.parent = button;
    const event = pointer(doc, "pointerdown", icon);
    expect(button.attributes.has("data-feedback-pressed")).toBe(true);
    expect(outer.attributes.has("data-feedback-pressed")).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    pointer(doc, "pointerup", icon);
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
  });
  it.each(["pointercancel", "lostpointercapture", "scroll", "visibilitychange"])("%sで押下状態を解除する", (name) => {
    const button = new Control();
    pointer(doc, "pointerdown", button);
    emit(doc, name);
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
  });
  it("フォーカス喪失はキーボード反応を解除し、クリックに伴うフォーカス移動は押下を保つ", () => {
    const button = new Control();
    emit(doc, "keydown", button, { key: "Enter" });
    emit(doc, "focusout", button);
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
    pointer(doc, "pointerdown", button);
    emit(doc, "focusout");
    expect(button.attributes.has("data-feedback-pressed")).toBe(true);
    emit(view, "blur");
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
  });
  it("スクロール相当の移動で解除し、移動を妨げない", () => {
    const button = new Control();
    pointer(doc, "pointerdown", button);
    const event = pointer(doc, "pointermove", button, { clientY: 80 });
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
  it.each(["disabled", "aria-disabled", "aria-busy", "inert"])("%sの操作を反応させない", (name) => {
    const button = new Control();
    button.setAttribute(name, "true");
    pointer(doc, "pointerdown", button);
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
  });
  it("無効な親の内側やテキスト入力・ドラッグハンドルは反応させない", () => {
    const parent = new Control("div");
    parent.setAttribute("inert", "");
    const child = new Control();
    child.parent = parent;
    const handle = new Control();
    handle.setAttribute("data-scene-handle", "");
    for (const target of [child, handle, new Input("text"), new Control("textarea"), new Control("select")]) {
      pointer(doc, "pointerdown", target);
      expect(target.attributes.has("data-feedback-pressed")).toBe(false);
    }
  });
  it("EnterとSpaceの表示はreleaseで解除し、Escapeでも解除する", () => {
    const button = new Control();
    for (const key of ["Enter", " "]) {
      const event = emit(doc, "keydown", button, { key });
      expect(button.attributes.has("data-feedback-pressed")).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      emit(doc, "keyup", button, { key });
      expect(button.attributes.has("data-feedback-pressed")).toBe(false);
    }
    emit(doc, "keydown", button, { key: "Enter" });
    emit(doc, "keydown", button, { key: "Escape" });
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
    const link = new Control("a");
    link.setAttribute("href", "/");
    emit(doc, "keydown", link, { key: " " });
    expect(link.attributes.has("data-feedback-pressed")).toBe(false);
  });
  it("解除処理は進行中の反応とイベントリスナーを破棄する", () => {
    const button = new Control();
    pointer(doc, "pointerdown", button);
    dispose?.();
    dispose = undefined;
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
    pointer(doc, "pointerdown", button);
    expect(button.attributes.has("data-feedback-pressed")).toBe(false);
  });
});

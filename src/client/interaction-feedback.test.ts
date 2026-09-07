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
let doc: EventTarget & { visibilityState: string };
let view: EventTarget & {
  localStorage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
  matchMedia: ReturnType<typeof vi.fn>;
};
let vibrate: ReturnType<typeof vi.fn>;
let dispose: (() => void) | undefined;
beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const stored = new Map<string, string>();
  doc = Object.assign(new EventBus(), { visibilityState: "visible" });
  view = Object.assign(new EventBus(), {
    localStorage: {
      getItem: vi.fn((key: string) => stored.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        stored.set(key, value);
      }),
    },
    matchMedia: vi.fn(() => ({ matches: false })),
  });
  vibrate = vi.fn(() => true);
  vi.stubGlobal("window", view);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", { vibrate });
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

describe("補助振動", () => {
  it("初期ONで、OFFを保存すると次の操作では振動しない", () => {
    expect(feedback.getHapticsEnabled()).toBe(true);
    feedback.setHapticsEnabled(false);
    expect(feedback.getHapticsEnabled()).toBe(false);
    feedback.hapticFeedback("success");
    expect(vibrate).not.toHaveBeenCalled();
    feedback.setHapticsEnabled(true);
    feedback.hapticFeedback();
    expect(vibrate).toHaveBeenCalledOnce();
  });
  it("保存領域が使えなくても同一セッションのOFFを保持する", () => {
    view.localStorage.getItem.mockImplementation(() => {
      throw new Error("unavailable");
    });
    view.localStorage.setItem.mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(() => feedback.setHapticsEnabled(false)).not.toThrow();
    feedback.hapticFeedback();
    expect(feedback.getHapticsEnabled()).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("読み取りだけ可能な保存領域でもOFFへの切替をその場で反映する", () => {
    view.localStorage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    feedback.setHapticsEnabled(false);
    expect(feedback.getHapticsEnabled()).toBe(false);
    feedback.hapticFeedback();
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("動きを減らす設定または非表示タブでは振動しない", () => {
    view.matchMedia.mockReturnValue({ matches: true });
    feedback.hapticFeedback();
    view.matchMedia.mockReturnValue({ matches: false });
    doc.visibilityState = "hidden";
    feedback.hapticFeedback();
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("非対応・拒否・例外が操作を妨げない", () => {
    vi.stubGlobal("navigator", {});
    expect(() => feedback.hapticFeedback()).not.toThrow();
    vi.stubGlobal("navigator", { vibrate });
    vibrate.mockImplementationOnce(() => {
      throw new Error("denied");
    });
    expect(() => feedback.hapticFeedback()).not.toThrow();
    vibrate.mockReturnValueOnce(false);
    feedback.hapticFeedback();
    feedback.hapticFeedback();
    expect(vibrate).toHaveBeenCalledTimes(3);
  });
  it("同じ操作の連続振動を抑え、時間を空けた操作は受け付ける", () => {
    feedback.hapticFeedback("selection");
    feedback.hapticFeedback("success");
    expect(vibrate).toHaveBeenCalledOnce();
    vi.mocked(Date.now).mockReturnValue(1300);
    feedback.hapticFeedback("lift");
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
});

describe("委譲された押下フィードバック", () => {
  beforeEach(() => {
    dispose = feedback.initializeInteractionFeedback();
  });
  it("入れ子の内側だけを反応させ、通常タップでは振動も既定動作の抑止もしない", () => {
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
    expect(vibrate).not.toHaveBeenCalled();
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
  it("選択が受理された場合だけ振動し、制御入力が戻されたら振動しない", async () => {
    const choice = new Input("checkbox");
    choice.checked = true;
    emit(doc, "change", choice);
    choice.checked = false;
    await Promise.resolve();
    expect(vibrate).not.toHaveBeenCalled();
    choice.checked = true;
    emit(doc, "change", choice);
    await Promise.resolve();
    expect(vibrate).toHaveBeenCalledOnce();
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

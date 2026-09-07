import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ grid: null as unknown, dispose: undefined as undefined | (() => void) }));
vi.mock("react", () => ({
  useRef: () => ({ current: state.grid }),
  useState: () => ["", vi.fn()],
  useEffect: (effect: () => (() => void) | undefined) => {
    state.dispose = effect();
  },
}));
import { moveItemByOffset, useMediaReorder, useSceneReorder } from "./useMediaReorder";

class Card extends EventTarget {
  dataset: { mediaId?: string; sceneId?: string };
  style = {
    transform: "",
    removeProperty: (name: string) => {
      if (name === "transform") this.style.transform = "";
    },
  };
  classList = { add: vi.fn(), remove: vi.fn() };
  removed = false;
  constructor(
    id: string,
    public index: number,
    public interactive = false,
    public handle = false,
  ) {
    super();
    this.dataset = { mediaId: id, sceneId: id };
  }
  closest(selector: string) {
    if (selector === "[data-scene-handle]") return this.handle ? this : null;
    return selector === "[data-media-id]" || selector === "[data-scene-id]" || this.interactive ? this : null;
  }
  contains() {
    return false;
  }
  getBoundingClientRect() {
    return { left: this.index * 100, top: 100, width: 90, height: 90 };
  }
  cloneNode() {
    return new Card(this.dataset.mediaId!, this.index);
  }
  removeAttribute() {}
  setAttribute() {}
  setPointerCapture() {}
  hasPointerCapture() {
    return true;
  }
  releasePointerCapture() {}
  remove() {
    this.removed = true;
  }
}
class Grid extends EventTarget {
  classList = { add: vi.fn(), remove: vi.fn() };
  cards = [new Card("a", 0), new Card("b", 1), new Card("c", 2)];
  querySelectorAll() {
    return this.cards;
  }
}
function pointer(target: EventTarget, name: string, x: number, card?: Card) {
  const event = new Event(name, { cancelable: true });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    button: { value: 0 },
    pointerId: { value: 1 },
    clientX: { value: x },
    clientY: { value: 145 },
    ...(card ? { target: { value: card } } : {}),
  });
  target.dispatchEvent(event);
}

describe("長押しメディア並び替え", () => {
  let grid: Grid;
  let view: EventTarget;
  let overlays: Card[];
  let change: ReturnType<typeof vi.fn<(order: string[]) => void>>;
  beforeEach(() => {
    vi.useFakeTimers();
    grid = new Grid();
    view = new EventTarget();
    overlays = [];
    change = vi.fn();
    Object.assign(view, {
      setTimeout,
      scrollY: 0,
      innerHeight: 800,
      scrollBy: vi.fn(),
      getSelection: () => ({ removeAllRanges: vi.fn() }),
    });
    vi.stubGlobal("window", view);
    vi.stubGlobal("document", {
      activeElement: null,
      body: { append: (card: Card) => overlays.push(card) },
      getSelection: () => ({ removeAllRanges: vi.fn() }),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 16));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    state.grid = grid;
    useMediaReorder(["a", "b", "c"], change, false);
  });
  afterEach(() => {
    state.dispose?.();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("350msの長押し後だけ追従画像を出し、指を離すと挿入を確定する", () => {
    pointer(grid, "pointerdown", 45, grid.cards[0]);
    vi.advanceTimersByTime(349);
    expect(overlays).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(overlays).toHaveLength(1);
    pointer(view, "pointermove", 245);
    vi.advanceTimersByTime(16);
    expect(overlays[0].style.transform).toContain("translate(200px, 0px)");
    expect(grid.cards[1].style.transform).toBe("translate(-100px, 0px)");
    expect(change).not.toHaveBeenCalled();
    pointer(view, "pointerup", 245);
    expect(change).toHaveBeenCalledWith(["b", "c", "a"]);
    expect(overlays[0].removed).toBe(true);
    expect(grid.cards[1].style.transform).toBe("");
  });
  it("長押し前に移動した場合は通常スクロールを妨げず並び替えを始めない", () => {
    pointer(grid, "pointerdown", 45, grid.cards[0]);
    pointer(view, "pointermove", 60);
    vi.advanceTimersByTime(500);
    pointer(view, "pointerup", 245);
    expect(overlays).toHaveLength(0);
    expect(change).not.toHaveBeenCalled();
  });
  it.each(["pointercancel", "blur", "resize"])("%sで元の順序を維持し後続のreleaseを無視する", (name) => {
    pointer(grid, "pointerdown", 45, grid.cards[0]);
    vi.advanceTimersByTime(350);
    pointer(view, "pointermove", 245);
    vi.advanceTimersByTime(16);
    view.dispatchEvent(new Event(name));
    pointer(view, "pointerup", 245);
    expect(change).not.toHaveBeenCalled();
    expect(overlays[0].removed).toBe(true);
    expect(grid.cards.every((card) => card.style.transform === "")).toBe(true);
  });
  it("Escapeでもキャンセルする", () => {
    pointer(grid, "pointerdown", 45, grid.cards[0]);
    vi.advanceTimersByTime(350);
    const event = new Event("keydown");
    Object.defineProperty(event, "key", { value: "Escape" });
    view.dispatchEvent(event);
    pointer(view, "pointerup", 245);
    expect(change).not.toHaveBeenCalled();
    expect(overlays[0].removed).toBe(true);
  });
  it("削除ボタンから長押しを始めない", () => {
    pointer(grid, "pointerdown", 45, new Card("a", 0, true));
    vi.advanceTimersByTime(500);
    expect(overlays).toHaveLength(0);
  });
  it("見出しはハンドルから待たずに追従して並び替える", () => {
    state.dispose?.();
    useSceneReorder(["a", "b", "c"], change, false);
    grid.cards[0].handle = true;
    pointer(grid, "pointerdown", 45, grid.cards[0]);
    expect(overlays).toHaveLength(1);
    expect(grid.cards[0].classList.add).toHaveBeenCalledWith("scene-drag-placeholder");
    expect(grid.classList.add).toHaveBeenCalledWith("scene-reordering");
    pointer(view, "pointermove", 245);
    vi.advanceTimersByTime(16);
    pointer(view, "pointerup", 245);
    expect(change).toHaveBeenCalledWith(["b", "c", "a"]);
  });
  it("見出しの本文・入力・削除ボタンではドラッグしない", () => {
    state.dispose?.();
    useSceneReorder(["a", "b", "c"], change, false);
    for (const target of [grid.cards[0], new Card("a", 0, true)]) {
      pointer(grid, "pointerdown", 45, target);
      vi.advanceTimersByTime(500);
      pointer(view, "pointerup", 245);
    }
    expect(overlays).toHaveLength(0);
    expect(change).not.toHaveBeenCalled();
  });
  it("編集モード終了で進行中のドラッグを破棄する", () => {
    state.dispose?.();
    useSceneReorder(["a", "b", "c"], change, false);
    grid.cards[0].handle = true;
    pointer(grid, "pointerdown", 45, grid.cards[0]);
    pointer(view, "pointermove", 245);
    state.dispose?.();
    useSceneReorder(["a", "b", "c"], change, true);
    pointer(view, "pointerup", 245);
    expect(change).not.toHaveBeenCalled();
    expect(overlays[0].removed).toBe(true);
  });
  it("キーボード操作用の移動は範囲外を無視する", () => {
    expect(moveItemByOffset(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItemByOffset(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });
});

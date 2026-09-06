import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPostVisible, watchPostVisibility } from "./useSeenTracking";

describe("continuous foreground post visibility", () => {
  let browser: EventTarget;
  let page: EventTarget & { visibilityState: string };
  let rect: { top: number; bottom: number; left: number; right: number; height: number; width: number };
  let element: HTMLElement;
  beforeEach(() => {
    vi.useFakeTimers();
    browser = Object.assign(new EventTarget(), { innerHeight: 800, innerWidth: 390, setTimeout, clearTimeout });
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", page);
    const observer = class {
      observe() {}
      disconnect() {}
    };
    vi.stubGlobal("IntersectionObserver", observer);
    vi.stubGlobal("ResizeObserver", observer);
    rect = { top: 100, bottom: 2100, height: 2000, left: 0, right: 390, width: 390 };
    element = { getBoundingClientRect: () => rect } as HTMLElement;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("画面より高い投稿でも表示可能な領域を2秒見れば一度記録する", () => {
    const mark = vi.fn();
    const stop = watchPostVisibility(element, mark);
    expect(isPostVisible(rect)).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(mark).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mark).toHaveBeenCalledTimes(1);
    browser.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(5000);
    expect(mark).toHaveBeenCalledTimes(1);
    stop();
  });

  it("タブが非表示になったら経過時間を捨て、復帰後に2秒を数え直す", () => {
    const mark = vi.fn();
    const stop = watchPostVisibility(element, mark);
    vi.advanceTimersByTime(1500);
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(10000);
    expect(mark).not.toHaveBeenCalled();
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1999);
    expect(mark).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mark).toHaveBeenCalledTimes(1);
    stop();
  });

  it("画面外へのスクロールと離脱は未完了のタイマーを取り消す", () => {
    const mark = vi.fn();
    const stop = watchPostVisibility(element, mark);
    vi.advanceTimersByTime(1500);
    rect = { ...rect, top: 1000, bottom: 3000 };
    browser.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1000);
    expect(mark).not.toHaveBeenCalled();
    rect = { ...rect, top: 100, bottom: 2100 };
    browser.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(1000);
    stop();
    vi.advanceTimersByTime(5000);
    expect(mark).not.toHaveBeenCalled();
  });
});

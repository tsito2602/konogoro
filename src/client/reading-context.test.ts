import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { canReturnInApp, readPages, restoredY, restorePanelPosition } from "./reading-context";
vi.mock("./api", () => ({ api: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("reading position", () => {
  const items = [
    { id: "a", top: 100 },
    { id: "b", top: 800 },
    { id: "c", top: 1300 },
  ];
  it("restores the same item and viewport offset after preceding content changes", () => {
    expect(restoredY({ y: 500, item: "b", offset: 90, index: 1 }, items, 2000)).toBe(710);
  });
  it("falls back to the nearest surviving item after deletion", () => {
    expect(restoredY({ y: 1100, item: "deleted", offset: 90, index: 8 }, items, 2000)).toBe(1210);
  });
  it("clamps an empty filtered list and a short page without an endless retry", () => {
    expect(restoredY({ y: 1200, item: "deleted", index: 1 }, [], 0)).toBe(0);
    expect(restoredY({ y: 1200 }, [], 300)).toBe(300);
  });
  it("restores a post's own scroll panel without repeating the comment focus intent", () => {
    const panel = Object.assign(new EventTarget(), { scrollTop: 0 }) as unknown as HTMLElement;
    const initial = vi.fn(() => {
      panel.scrollTop = 400;
    });
    const cleanup = restorePanelPosition("panel-test", panel, initial);
    panel.scrollTop = 650;
    cleanup();
    panel.scrollTop = 0;
    restorePanelPosition("panel-test", panel, initial)();
    expect(initial).toHaveBeenCalledTimes(1);
    expect(panel.scrollTop).toBe(650);
  });
  it("does not go back outside the application on a direct link", () => {
    vi.stubGlobal("window", { history: { state: { idx: 0 } } });
    expect(canReturnInApp()).toBe(false);
    vi.stubGlobal("window", { history: { state: { idx: 2 } } });
    expect(canReturnInApp()).toBe(true);
  });
});

describe("returning to a paginated list", () => {
  it("revalidates all previously loaded pages so removed data disappears while context remains", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ posts: [{ id: "a" }], nextCursor: "page 2", unreadCount: 2 })
      .mockResolvedValueOnce({ posts: [{ id: "c" }], nextCursor: null, unreadCount: 2 });
    const result = await readPages<{ posts: { id: string }[]; nextCursor: string | null; unreadCount: number }>(
      "/timeline",
      "posts",
      3,
    );
    expect(result.posts.map((post) => post.id)).toEqual(["a", "c"]);
    expect(result.nextCursor).toBeNull();
    expect(api).toHaveBeenLastCalledWith("/timeline?cursor=page%202");
  });
  it("stops if a server repeats a cursor instead of fetching indefinitely", async () => {
    vi.mocked(api).mockResolvedValue({ media: [], nextCursor: "same" });
    await readPages<{ media: unknown[]; nextCursor: string | null }>("/album", "media", 100);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

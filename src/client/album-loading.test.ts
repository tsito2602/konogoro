import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { albumPath, readAlbumPeriod, selectedAlbumPeriod } from "./album-loading";
import type { AlbumMedia } from "../shared/types";
vi.mock("./api", () => ({ api: vi.fn() }));
const media = (id: string) => ({ id }) as AlbumMedia;
beforeEach(() => vi.clearAllMocks());
describe("album period loading", () => {
  it("画像未取得の古い月や年もカタログから選択できる", () => {
    const months = [
      { key: "2026-09", count: 65 },
      { key: "2025-01", count: 65 },
    ];
    expect(selectedAlbumPeriod(months, "2025-01")).toBe("2025-01");
    expect(selectedAlbumPeriod(months, "all-2025")).toBe("all-2025");
    expect(selectedAlbumPeriod(months, "2024-01")).toBe("2026-09");
    expect(selectedAlbumPeriod([], "2025-01")).toBe("");
  });
  it("カーソルをエンコードし期間指定を維持する", () => {
    expect(albumPath("all-2025", "date|time|id")).toBe("/album?year=2025&cursor=date%7Ctime%7Cid");
    expect(albumPath("2025-01")).toBe("/album?month=2025-01");
  });
  it("写真から戻る際は選択期間の読込済み件数まで復元する", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ media: [media("1")], nextCursor: "next" })
      .mockResolvedValueOnce({ media: [media("1"), media("2")], nextCursor: "last" });
    const signal = new AbortController().signal;
    const result = await readAlbumPeriod("2025-01", 2, signal);
    expect(result.media.map((item) => item.id)).toEqual(["1", "2"]);
    expect(result.nextCursor).toBe("last");
    expect(api).toHaveBeenNthCalledWith(2, "/album?month=2025-01&cursor=next", { signal });
  });
  it("月切替で中断したリクエストの結果を返さず、続きも取得しない", async () => {
    const controller = new AbortController();
    vi.mocked(api).mockImplementationOnce(async () => {
      controller.abort();
      return { media: [media("old")], nextCursor: "next" };
    });
    await expect(readAlbumPeriod("2025-01", 65, controller.signal)).rejects.toThrow();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("初回は全画像の取得完了を待たず1ページを表示する", async () => {
    vi.mocked(api).mockResolvedValueOnce({ media: [media("1")], nextCursor: "next" });
    await readAlbumPeriod("all-2025", 0, new AbortController().signal);
    expect(api).toHaveBeenCalledTimes(1);
  });
});

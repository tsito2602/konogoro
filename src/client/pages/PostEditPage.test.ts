import { describe, expect, it } from "vitest";
import { moveMediaItem } from "../media-order";

describe("投稿メディアの並び替え", () => {
  it("ドラッグした項目をドロップ先へ移動する", () => {
    expect(moveMediaItem(["media-1", "media-2", "media-3"], "media-1", "media-3")).toEqual([
      "media-2",
      "media-3",
      "media-1",
    ]);
    expect(moveMediaItem(["media-1", "media-2", "media-3"], "media-3", "media-1")).toEqual([
      "media-3",
      "media-1",
      "media-2",
    ]);
  });

  it("存在しない項目では順序を変更しない", () => {
    const mediaIds = ["media-1", "media-2"];
    expect(moveMediaItem(mediaIds, "missing", "media-2")).toBe(mediaIds);
  });
});

import { describe, expect, it } from "vitest";
import type { AlbumMedia } from "../../shared/types";
import { appendUniqueAlbumMedia, groupAlbumMedia } from "./AlbumPage";

const media = (id: string, capturedAt: string): AlbumMedia => ({
  id,
  postId: `post-${id}`,
  kind: "image",
  capturedAt,
  thumbnailUrl: `/media/${id}/thumbnail`,
  previewUrl: `/media/${id}/preview`,
});

describe("album grouping", () => {
  it("撮影日時の年月ごとにまとめる", () => {
    const groups = groupAlbumMedia([
      media("1", "2026-09-15T00:00:00.000Z"),
      media("2", "2026-09-01T00:00:00.000Z"),
      media("3", "2026-08-31T00:00:00.000Z"),
    ]);

    expect(groups.map((group) => [group.label, group.media.length])).toEqual([
      ["2026年9月", 2],
      ["2026年8月", 1],
    ]);
    expect(groups.map(({ key, year, month }) => ({ key, year, month }))).toEqual([
      { key: "2026-09", year: 2026, month: 9 },
      { key: "2026-08", year: 2026, month: 8 },
    ]);
  });

  it("追加読込時の重複を除く", () => {
    expect(
      appendUniqueAlbumMedia(
        [media("1", "2026-09-01T00:00:00.000Z")],
        [media("1", "2026-09-01T00:00:00.000Z"), media("2", "2026-08-01T00:00:00.000Z")],
      ).map((item) => item.id),
    ).toEqual(["1", "2"]);
  });
});

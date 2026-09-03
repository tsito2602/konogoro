import { describe, expect, it } from "vitest";
import {
  mediaExitOffset,
  swipeDirection,
  swipeDragOffset,
  viewerCommentNavigation,
  viewerNavigationItems,
} from "./MediaViewerPage";

describe("swipeDirection", () => {
  it("右へ十分に動かすと前のメディアへ移動する", () => {
    expect(swipeDirection(80, 12)).toBe("previous");
  });

  it("左へ十分に動かすと次のメディアへ移動する", () => {
    expect(swipeDirection(-80, 12)).toBe("next");
  });

  it("短い移動はスワイプとして扱わない", () => {
    expect(swipeDirection(49, 0)).toBeNull();
  });

  it("縦方向の移動が大きい場合はスワイプとして扱わない", () => {
    expect(swipeDirection(80, 70)).toBeNull();
  });
});

describe("mediaExitOffset", () => {
  it("前へ送ると現在のメディアを右へ移動する", () => {
    expect(mediaExitOffset("previous", 390)).toBe(390);
  });

  it("次へ送ると現在のメディアを左へ移動する", () => {
    expect(mediaExitOffset("next", 390)).toBe(-390);
  });
});

describe("swipeDragOffset", () => {
  it("移動できる方向では指の動きに近い距離だけ追従する", () => {
    expect(swipeDragOffset(-100, true, true)).toBe(-88);
  });

  it("先頭より前へ引いた場合は抵抗を付ける", () => {
    expect(swipeDragOffset(100, false, true)).toBe(24);
  });

  it("末尾より後ろへ引いた場合は抵抗を付ける", () => {
    expect(swipeDragOffset(-100, true, false)).toBe(-24);
  });
});

describe("viewerNavigationItems", () => {
  const postMedia = [{ id: "media-1", kind: "image" as const, thumbnailUrl: "/media-1" }];

  it("アルバムから開いた場合は投稿をまたぐメディアを返す", () => {
    const albumMedia = [
      { ...postMedia[0], postId: "post-1", capturedAt: "2026-09-01", previewUrl: "/preview-1" },
      {
        id: "media-2",
        postId: "post-2",
        kind: "image" as const,
        capturedAt: "2026-09-02",
        thumbnailUrl: "/media-2",
        previewUrl: "/preview-2",
      },
    ];

    expect(viewerNavigationItems("post-1", postMedia, albumMedia).map(({ postId, id }) => `${postId}/${id}`)).toEqual([
      "post-1/media-1",
      "post-2/media-2",
    ]);
  });

  it("通常表示では現在の投稿内だけを返す", () => {
    expect(viewerNavigationItems("post-1", postMedia)).toEqual([{ ...postMedia[0], postId: "post-1" }]);
  });
});

describe("viewerCommentNavigation", () => {
  it("投稿詳細を開いてコメント入力へフォーカスする状態を付ける", () => {
    expect(viewerCommentNavigation("post-1", { returnToPrevious: true })).toEqual({
      to: "/posts/post-1",
      state: { returnToPrevious: true, postPage: true, focusComment: true },
    });
  });
});

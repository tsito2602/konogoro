import { describe, expect, it } from "vitest";
import {
  clampImageScale,
  clampImageTranslation,
  isImageTap,
  mediaExitOffset,
  pinchImageTransform,
  pointCenter,
  pointDistance,
  swipeDirection,
  swipeDragOffset,
  viewerCommentNavigation,
  viewerNavigationItems,
} from "./MediaViewerPage";

describe("image zoom", () => {
  it("倍率を等倍から4倍の範囲に制限する", () => {
    expect(clampImageScale(0.5)).toBe(1);
    expect(clampImageScale(2.5)).toBe(2.5);
    expect(clampImageScale(6)).toBe(4);
  });

  it("2点間の距離と中心を求める", () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pointCenter({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 20, y: 30 });
  });

  it("指の中心にあった画像位置を保って拡大する", () => {
    expect(pinchImageTransform({ scale: 1, x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 0 }, 2)).toEqual({
      scale: 2,
      x: -50,
      y: 0,
    });
  });

  it("拡大画像を表示領域の外へ移動しすぎない", () => {
    expect(
      clampImageTranslation({ scale: 2, x: 300, y: -300 }, { width: 300, height: 200 }, { width: 300, height: 300 }),
    ).toEqual({ scale: 2, x: 150, y: -50 });
  });

  it("等倍へ戻したときは位置も中央へ戻す", () => {
    expect(
      clampImageTranslation({ scale: 1, x: 100, y: -100 }, { width: 300, height: 200 }, { width: 300, height: 300 }),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("短い指移動だけをオーバーレイ切替のタップとみなす", () => {
    expect(isImageTap(3, -4)).toBe(true);
    expect(isImageTap(8, 0)).toBe(false);
    expect(isImageTap(0, -8)).toBe(false);
  });
});

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
      state: { returnToPrevious: true, postPage: true, commentIntent: "write" },
    });
  });
});

it("uses the post when a detail photo is outside the originating album month", () => {
  const first = { id: "month-photo", kind: "image" as const, thumbnailUrl: "/1" };
  const second = { id: "other-month", kind: "image" as const, thumbnailUrl: "/2" };
  const album = [{ ...first, postId: "p", capturedAt: "2026-09-01", previewUrl: "/1" }];
  expect(viewerNavigationItems("p", [first, second], album, "other-month")).toEqual([
    { ...first, postId: "p" },
    { ...second, postId: "p" },
  ]);
});

it("keeps viewer controls and album selection rendered while another post is loading", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MemoryRouter, Routes, Route } = await import("react-router-dom");
  const { MediaViewerPage } = await import("./MediaViewerPage");
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          {
            pathname: "/posts/p2/media/m2",
            state: {
              albumMedia: [
                { id: "m1", postId: "p1", kind: "image", thumbnailUrl: "/1" },
                { id: "m2", postId: "p2", kind: "image", thumbnailUrl: "/2" },
              ],
            },
          },
        ],
      },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/posts/:postId/media/:mediaId",
          element: createElement(MediaViewerPage),
        }),
      ),
    ),
  );
  expect(html).toContain("2 / 2");
  expect(html).toContain('aria-label="閉じる"');
  expect(html).toContain('aria-label="前の写真・動画"');
  expect(html).toContain('aria-current="true"');
  expect(html).toContain('role="status"');
  expect(html).toContain('class="viewer-viewport overlay-visible"');
  expect(html).toContain('class="viewer-header viewer-overlay"');
  expect(html).toContain('class="viewer-info viewer-overlay"');
  expect(html).not.toContain("skeleton-viewer");
});

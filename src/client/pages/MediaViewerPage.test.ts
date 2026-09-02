import { describe, expect, it } from "vitest";
import { swipeDirection, swipeDragOffset } from "./MediaViewerPage";

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

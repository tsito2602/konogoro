import { describe, expect, it } from "vitest";
import { swipeDirection } from "./MediaViewerPage";

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

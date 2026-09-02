import { describe, expect, it } from "vitest";
import { shouldClosePostSheet } from "./PostDetailPage";

describe("post detail sheet", () => {
  it("十分に下へ動かしたときだけ閉じる", () => {
    expect(shouldClosePostSheet(71)).toBe(false);
    expect(shouldClosePostSheet(72)).toBe(true);
  });

  it("上方向の操作では閉じない", () => {
    expect(shouldClosePostSheet(-100)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { modalTransform } from "./post-modal";

describe("投稿を開いた写真へのズーム", () => {
  const target = { left: 100, top: 40, width: 1000, height: 800 };
  it("写真の中心と大きさから変形量を求める", () => {
    expect(modalTransform({ left: 100, top: 100, width: 300, height: 200 }, target, 1200, 900)).toBe(
      "translate(-350px, -240px) scale(0.25)",
    );
  });
  it.each([
    { left: 0, top: 900, width: 300, height: 200 },
    { left: 0, top: -201, width: 300, height: 200 },
    { left: 1200, top: 100, width: 300, height: 200 },
    { left: 0, top: 100, width: 0, height: 200 },
  ])("元写真が見えない場合はフェードに戻す", (source) => {
    expect(modalTransform(source, target, 1200, 900)).toBeNull();
  });
});

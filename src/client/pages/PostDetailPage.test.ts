import { describe, expect, it } from "vitest";
import { shouldFocusComment } from "./PostDetailPage";

describe("shouldFocusComment", () => {
  it("Viewerからコメント導線で開いた場合だけフォーカスする", () => {
    expect(shouldFocusComment({ focusComment: true })).toBe(true);
    expect(shouldFocusComment({ focusComment: false })).toBe(false);
    expect(shouldFocusComment(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { shouldFocusComment } from "./PostDetailPage";

describe("shouldFocusComment", () => {
  it("Viewerからコメント導線で開いた場合だけフォーカスする", () => {
    expect(shouldFocusComment({ focusComment: true })).toBe(true);
    expect(shouldFocusComment({ focusComment: false })).toBe(false);
    expect(shouldFocusComment(null)).toBe(false);
  });
});

it("does not focus the composer when opening existing comments", () => {
  expect(shouldFocusComment({ commentIntent: "read" })).toBe(false);
  expect(shouldFocusComment({ commentIntent: "write" })).toBe(true);
  expect(shouldFocusComment({ commentIntent: "unknown" })).toBe(false);
});

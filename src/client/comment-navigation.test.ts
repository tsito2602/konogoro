import { describe, expect, it, vi } from "vitest";
import { commentNavigationState, commentTargetId, revealComment } from "./comment-navigation";

describe("comment destination", () => {
  it("keeps the specific comment when opening an activity without turning it into a compose request", () => {
    expect(commentTargetId(commentNavigationState("read", { commentId: "comment-1" }))).toBe("comment-1");
    expect(commentTargetId(commentNavigationState("write", { commentId: "comment-1" }))).toBeNull();
    expect(commentTargetId({ commentIntent: "read", commentId: 1 })).toBeNull();
    expect(commentTargetId({ commentIntent: "read", commentId: "" })).toBeNull();
    expect(commentTargetId(null)).toBeNull();
  });

  it("scrolls only the conversation panel and falls back to the conversation if a comment was deleted", () => {
    const panel = { scrollTop: 100, getBoundingClientRect: () => ({ top: 20 }) };
    const comment = {
      dataset: { commentId: "comment-1" },
      getBoundingClientRect: () => ({ top: 300 }),
      classList: { add: vi.fn() },
    };
    const container = {
      querySelectorAll: () => [comment],
      matches: () => false,
      closest: () => panel,
      getBoundingClientRect: () => ({ top: 80 }),
      classList: { add: vi.fn() },
    };
    expect(revealComment(container as unknown as HTMLElement, "comment-1")).toBe(comment);
    expect(panel.scrollTop).toBe(364);
    panel.scrollTop = 100;
    expect(revealComment(container as unknown as HTMLElement, "deleted")).toBe(container);
    expect(panel.scrollTop).toBe(144);
  });
});

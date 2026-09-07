export type CommentIntent = "write" | "read";
export function commentTargetId(state: unknown): string | null {
  if (commentIntent(state) !== "read" || !state || typeof state !== "object") return null;
  return "commentId" in state && typeof state.commentId === "string" && state.commentId.length > 0
    ? state.commentId
    : null;
}

/** Reveal only inside the conversation's scroll panel, leaving the background page in place. */
export function revealComment(container: HTMLElement, commentId: string | null): HTMLElement {
  const target =
    Array.from(container.querySelectorAll<HTMLElement>("[data-comment-id]")).find(
      (element) => element.dataset.commentId === commentId,
    ) ?? container;
  const panel = container.matches(".viewer-comment-list")
    ? container
    : container.closest<HTMLElement>(".post-page-scroll");
  if (panel) {
    panel.scrollTop += target.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16;
  }
  target.classList.add("comment-arrived");
  return target;
}
export function commentNavigationState(intent: CommentIntent, currentState: unknown = null) {
  const state = currentState && typeof currentState === "object" ? currentState : {};
  return { ...state, postPage: true, commentIntent: intent };
}
export function commentIntent(state: unknown): CommentIntent | null {
  if (!state || typeof state !== "object") return null;
  if ("commentIntent" in state && (state.commentIntent === "write" || state.commentIntent === "read"))
    return state.commentIntent;
  if ("focusComment" in state && state.focusComment === true) return "write";
  return null;
}

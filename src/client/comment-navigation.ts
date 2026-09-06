export type CommentIntent = "write" | "read";
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

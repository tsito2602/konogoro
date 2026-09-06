/** Scope retry keys to the authenticated actor and resource; clients cannot choose another member's IDs. */
export async function retryResourceId(scope: string[], requestId: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([...scope, requestId]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

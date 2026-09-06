/** Re-read the same post on retry: a successful DELETE response may have been lost. */
export async function removeMediaWithReconciliation(
  ids: string[],
  loadIds: () => Promise<string[]>,
  remove: (id: string) => Promise<unknown>,
) {
  if (ids.length === 0) return;
  const remaining = new Set(await loadIds());
  for (const id of ids) if (remaining.has(id)) await remove(id);
}

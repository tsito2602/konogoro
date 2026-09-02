export function moveMediaItem(mediaIds: string[], sourceId: string, targetId: string): string[] {
  const sourceIndex = mediaIds.indexOf(sourceId);
  const targetIndex = mediaIds.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return mediaIds;
  const reordered = [...mediaIds];
  const [source] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, source);
  return reordered;
}

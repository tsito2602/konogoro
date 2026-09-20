/** Only regenerated thumbnails need a new cache identity. */
export function thumbnailUrl(id: string, key?: string | null): string {
  const revision = key?.match(/\/regenerated-([0-9A-HJKMNP-TV-Z]{26})\.png$/)?.[1];
  return `/api/media/${id}/content?variant=thumbnail${revision ? `&v=${revision}` : ""}`;
}

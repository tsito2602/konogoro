export type MediaUploadStatus = "pending" | "uploaded" | "failed";

export function canPublishMedia(statuses: MediaUploadStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status === "uploaded");
}

export function retryableMediaIndexes(statuses: MediaUploadStatus[]): number[] {
  return statuses.flatMap((status, index) => status === "failed" ? [index] : []);
}

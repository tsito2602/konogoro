export const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
export const MULTIPART_PART_SIZE = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export type MultipartVariant = "original" | "playback";
export type MultipartSession = {
  sessionId: string;
  partSize: number;
  partCount: number;
  status: "pending" | "completed";
};

export function multipartPartBytes(byteSize: number, partNumber: number, partSize = MULTIPART_PART_SIZE): number {
  return Math.max(0, Math.min(partSize, byteSize - (partNumber - 1) * partSize));
}

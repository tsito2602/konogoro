export type UploadFile = {
  filename: string;
  mimeType: string;
  byteSize: number;
  capturedAt: string | null;
  durationSeconds: number | null;
};

export type ExistingMedia = {
  original_filename: string;
  mime_type: string;
  byte_size: number;
  captured_at: string | null;
  duration_seconds: number | null;
};

export function matchesUploadFiles(existing: ExistingMedia[], files: UploadFile[]): boolean {
  return existing.length === files.length && existing.every((media, index) => {
    const file = files[index];
    return media.original_filename === file.filename
      && media.mime_type === file.mimeType
      && media.byte_size === file.byteSize
      && media.captured_at === file.capturedAt
      && media.duration_seconds === file.durationSeconds;
  });
}

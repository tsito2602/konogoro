import { describe, expect, it } from "vitest";
import { matchesUploadFiles, type ExistingMedia, type UploadFile } from "./upload-request";

const file: UploadFile = {
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  byteSize: 1234,
  capturedAt: "2026-09-01T01:02:03.000Z",
  durationSeconds: null,
};

const media: ExistingMedia = {
  original_filename: file.filename,
  mime_type: file.mimeType,
  byte_size: file.byteSize,
  captured_at: file.capturedAt,
  duration_seconds: file.durationSeconds,
};

describe("upload request matching", () => {
  it("同じ順序と属性のファイルを再開できる", () => {
    expect(matchesUploadFiles([media], [file])).toBe(true);
  });

  it("ファイル数や属性が異なる再送を拒否する", () => {
    expect(matchesUploadFiles([media], [file, file])).toBe(false);
    expect(matchesUploadFiles([media], [{ ...file, byteSize: file.byteSize + 1 }])).toBe(false);
    expect(matchesUploadFiles([media], [{ ...file, filename: "other.jpg" }])).toBe(false);
  });

  it("順序が異なる再送を拒否する", () => {
    const secondFile = { ...file, filename: "second.jpg" };
    const secondMedia = { ...media, original_filename: secondFile.filename };
    expect(matchesUploadFiles([media, secondMedia], [secondFile, file])).toBe(false);
  });
});

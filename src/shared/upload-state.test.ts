import { describe, expect, it } from "vitest";
import { canPublishMedia, retryableMediaIndexes } from "./upload-state";

describe("media upload state", () => {
  it("全件uploadedのときだけ公開できる", () => {
    expect(canPublishMedia(["uploaded", "uploaded"])).toBe(true);
    expect(canPublishMedia(["uploaded", "failed"])).toBe(false);
    expect(canPublishMedia([])).toBe(false);
  });

  it("failedだけを再試行対象にする", () => {
    expect(retryableMediaIndexes(["uploaded", "failed", "pending", "failed"])).toEqual([1, 3]);
  });
});

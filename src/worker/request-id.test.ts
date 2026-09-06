import { describe, expect, it } from "vitest";
import { retryResourceId } from "./request-id";

describe("retry resource IDs", () => {
  it("応答を失って再試行しても同じリソースを参照する", async () => {
    const key = crypto.randomUUID();
    expect(await retryResourceId(["post", "owner-a"], key)).toBe(await retryResourceId(["post", "owner-a"], key));
    expect(await retryResourceId(["media", "owner-a", "post-a"], key)).toBe(
      await retryResourceId(["media", "owner-a", "post-a"], key),
    );
  });
  it("別の所有者・投稿・選択ファイルのリクエストIDは衝突しない", async () => {
    const key = crypto.randomUUID();
    const values = await Promise.all([
      retryResourceId(["post", "owner-a"], key),
      retryResourceId(["post", "owner-b"], key),
      retryResourceId(["media", "owner-a", "post-a"], key),
      retryResourceId(["media", "owner-b", "post-a"], key),
      retryResourceId(["media", "owner-a", "post-b"], key),
      retryResourceId(["media", "owner-a", "post-a"], crypto.randomUUID()),
    ]);
    expect(new Set(values).size).toBe(values.length);
  });
});

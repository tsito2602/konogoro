import { describe, expect, it, vi } from "vitest";
import { markPostSeen } from "./useSeenTracking";

describe("seen tracking", () => {
  it("API成功後にだけ閲覧済みを保存する", async () => {
    const storage = { setItem: vi.fn() };
    const request = vi.fn().mockResolvedValue(undefined);

    await markPostSeen("post-1", storage, request);

    expect(request).toHaveBeenCalledWith("/posts/post-1/view", { method: "POST" });
    expect(storage.setItem).toHaveBeenCalledWith("family-timeline:viewed:post-1", "1");
  });

  it("API失敗時は閲覧済みを保存しない", async () => {
    const storage = { setItem: vi.fn() };
    const request = vi.fn().mockRejectedValue(new Error("network error"));

    await markPostSeen("post-1", storage, request).catch(() => undefined);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { markPostSeen } from "./useSeenTracking";

describe("seen tracking", () => {
  it("API成功後にだけ閲覧済みを保存する", async () => {
    const storage = { setItem: vi.fn() };
    const request = vi.fn().mockResolvedValue(undefined);

    await markPostSeen("post-1", storage, request);

    expect(request).toHaveBeenCalledWith("/posts/post-1/view", { method: "POST" });
    expect(storage.setItem).toHaveBeenCalledWith("konogoro:viewed:post-1", "1");
  });

  it("API失敗時は閲覧済みを保存しない", async () => {
    const storage = { setItem: vi.fn() };
    const request = vi.fn().mockRejectedValue(new Error("network error"));

    await markPostSeen("post-1", storage, request).catch(() => undefined);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

it("保存領域が使えなくてもサーバーの記録成功を返す", async () => {
  const request = vi.fn().mockResolvedValue(undefined);
  await expect(
    markPostSeen(
      "no-storage",
      {
        setItem: () => {
          throw new Error("unavailable");
        },
      },
      request,
    ),
  ).resolves.toBeUndefined();
});

it("自動記録と次へが重なっても同じリクエストを共有し、失敗後は再試行できる", async () => {
  let reject!: (reason: Error) => void;
  const request = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  const storage = { setItem: vi.fn() };
  const automatic = markPostSeen("overlap", storage, request);
  const explicit = markPostSeen("overlap", storage, request);
  expect(explicit).toBe(automatic);
  expect(request).toHaveBeenCalledTimes(1);
  reject(new Error("offline"));
  await expect(automatic).rejects.toThrow("offline");
  await markPostSeen("overlap", storage, request);
  expect(request).toHaveBeenCalledTimes(2);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

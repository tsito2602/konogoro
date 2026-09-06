import { expect, it, vi } from "vitest";
import { removeMediaWithReconciliation } from "./remove-media";

it("途中で削除応答を失っても、次の試行は残っている写真だけ削除する", async () => {
  const remaining = new Set(["a", "b", "keep"]);
  const load = vi.fn(async () => [...remaining]);
  let first = true;
  const remove = vi.fn(async (id: string) => {
    remaining.delete(id);
    if (first) {
      first = false;
      throw new Error("response lost");
    }
  });
  await expect(removeMediaWithReconciliation(["a", "b"], load, remove)).rejects.toThrow();
  await removeMediaWithReconciliation(["a", "b"], load, remove);
  expect(remove.mock.calls).toEqual([["a"], ["b"]]);
  expect([...remaining]).toEqual(["keep"]);
});

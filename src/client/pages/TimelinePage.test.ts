import { describe, expect, it } from "vitest";
import type { Post } from "../../shared/types";
import { appendUniquePosts } from "./TimelinePage";

describe("timeline pagination", () => {
  it("追加取得で重複した投稿を除外する", () => {
    const first = { id: "first" } as Post;
    const second = { id: "second" } as Post;

    expect(appendUniquePosts([first], [first, second])).toEqual([first, second]);
  });
});

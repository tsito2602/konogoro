import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommentComposerSkeleton, PageSkeleton } from "./PageSkeleton";

describe("PageSkeleton", () => {
  it.each([
    "timeline",
    "activity",
    "events",
    "album",
    "event-detail",
    "post-detail",
    "form",
    "settings",
    "members",
    "viewer",
  ] as const)("%sは読み込み状態だけを支援技術へ伝える", (variant) => {
    const html = renderToStaticMarkup(<PageSkeleton variant={variant} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/読み込み中/g)).toHaveLength(1);
  });

  it("投稿詳細の読み込み中もコメント欄の高さを確保する", () => {
    const html = renderToStaticMarkup(<CommentComposerSkeleton />);
    expect(html).toContain("skeleton-comment-composer");
    expect(html).toContain('aria-busy="true"');
  });
});

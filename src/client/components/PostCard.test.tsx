import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Post } from "../../shared/types";
import { PostCard } from "./PostCard";

const post = {
  id: "post-1",
  title: "旅行",
  caption: "",
  eventId: null,
  eventTitle: null,
  sectionId: null,
  sectionTitle: null,
  capturedAt: "2026-09-01T00:00:00.000Z",
  publishedAt: "2026-09-01T00:00:00.000Z",
  authorName: "翼",
  canEdit: false,
  canDelete: false,
  viewedByCurrentUser: false,
  media: [],
  comments: [],
  seenBy: [],
} satisfies Post;

describe("PostCard", () => {
  it("未閲覧の投稿へ未閲覧表示を付ける", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={post} /></MemoryRouter>);
    expect(html).toContain('class="media-grid unseen"');
    expect(html).toContain('aria-label="未閲覧の旅行を開く"');
  });

  it("閲覧済みの投稿には未閲覧表示を付けない", () => {
    const html = renderToStaticMarkup(<MemoryRouter><PostCard post={{ ...post, viewedByCurrentUser: true }} /></MemoryRouter>);
    expect(html).toContain('class="media-grid"');
    expect(html).not.toContain('class="media-grid unseen"');
  });
});

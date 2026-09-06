import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlbumContentSkeleton, CommentComposerSkeleton, PageSkeleton, type SkeletonVariant } from "./PageSkeleton";
import type { CurrentUser } from "../../shared/types";

const user = (role: CurrentUser["role"], isStaging = false): CurrentUser => ({
  id: "fixture",
  displayName: "Fixture",
  role,
  isStaging,
});

describe("PageSkeleton", () => {
  it.each([
    "timeline",
    "unread",
    "activity",
    "events",
    "album",
    "event-detail",
    "post-detail",
    "event-edit",
    "post-edit",
    "settings",
    "members",
    "viewer",
  ] satisfies SkeletonVariant[])("%sは読み込み状態だけを支援技術へ伝える", (variant) => {
    const html = renderToStaticMarkup(<PageSkeleton variant={variant} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/読み込み中/g)).toHaveLength(1);
    expect(html).not.toMatch(/<(button|input|select|a)\b/);
  });

  it("投稿詳細の読み込み中もコメント欄の高さを確保する", () => {
    const html = renderToStaticMarkup(<CommentComposerSkeleton />);
    expect(html).toContain("skeleton-comment-composer");
    expect(html).toContain('aria-busy="true"');
  });

  it.each(["owner", "uploader", "viewer"] as const)("%sの補助欄は実画面の権限に従う", (role) => {
    const activity = renderToStaticMarkup(<PageSkeleton variant="activity" currentUser={user(role)} />);
    const settings = renderToStaticMarkup(<PageSkeleton variant="settings" currentUser={user(role)} />);
    expect(activity.includes("member-last-viewed-list")).toBe(role === "owner");
    expect(settings.includes("skeleton-family-section")).toBe(role === "owner");
    expect(activity).toContain("activity-list");
    expect(settings).not.toContain("skeleton-staging-section");
  });

  it.each(["owner", "uploader", "viewer"] as const)("stagingの%sには権限切替欄を確保する", (role) => {
    expect(renderToStaticMarkup(<PageSkeleton variant="settings" currentUser={user(role, true)} />)).toContain(
      "skeleton-staging-section",
    );
  });

  it("権限が不明なら管理者の欄を出さない", () => {
    expect(renderToStaticMarkup(<PageSkeleton variant="activity" />)).not.toContain("skeleton-viewers");
    expect(renderToStaticMarkup(<PageSkeleton variant="settings" />)).not.toContain("skeleton-family-section");
  });
});

it("アルバムの期間切替中は年月操作を重ねず、年一覧にはカバーを出さない", () => {
  const month = renderToStaticMarkup(<AlbumContentSkeleton />);
  const year = renderToStaticMarkup(<AlbumContentSkeleton allYear />);
  expect(month).toContain("album-cover");
  expect(year).not.toContain("album-cover");
  expect(month).not.toContain("album-picker-header");
  expect(year).toContain("album-grid");
  expect(year).toContain('role="status"');
});

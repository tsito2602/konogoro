import { describe, expect, it } from "vitest";
import type { User } from "./types";
import {
  canCreatePost,
  canDeleteComment,
  canDeletePost,
  canInviteFamily,
  canManageEvent,
  canViewMemberLastViewed,
} from "./permissions";

const owner: User = { id: "owner", displayName: "Owner", role: "owner" };
const uploader: User = { id: "uploader", displayName: "Uploader", role: "uploader" };
const viewer: User = { id: "viewer", displayName: "Viewer", role: "viewer" };

describe("permissions", () => {
  it("ownerとuploaderがイベントを管理できる", () => {
    expect(canManageEvent(owner)).toBe(true);
    expect(canManageEvent(uploader)).toBe(true);
    expect(canManageEvent(viewer)).toBe(false);
  });

  it("ownerだけが家族を招待できる", () => {
    expect(canInviteFamily(owner)).toBe(true);
    expect(canInviteFamily(uploader)).toBe(false);
    expect(canInviteFamily(viewer)).toBe(false);
  });

  it("ownerだけがメンバーの最終閲覧時間を表示できる", () => {
    expect(canViewMemberLastViewed(owner)).toBe(true);
    expect(canViewMemberLastViewed(uploader)).toBe(false);
    expect(canViewMemberLastViewed(viewer)).toBe(false);
  });

  it("ownerとuploaderが投稿できる", () => {
    expect(canCreatePost(owner)).toBe(true);
    expect(canCreatePost(uploader)).toBe(true);
    expect(canCreatePost(viewer)).toBe(false);
  });

  it("自分またはownerだけがコメントを削除できる", () => {
    expect(canDeleteComment(owner, "viewer")).toBe(true);
    expect(canDeleteComment(viewer, "viewer")).toBe(true);
    expect(canDeleteComment(uploader, "viewer")).toBe(false);
  });

  it("ownerとuploaderが全投稿を削除できる", () => {
    expect(canDeletePost(owner)).toBe(true);
    expect(canDeletePost(uploader)).toBe(true);
    expect(canDeletePost(viewer)).toBe(false);
  });
});

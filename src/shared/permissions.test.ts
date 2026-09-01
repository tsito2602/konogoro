import { describe, expect, it } from "vitest";
import type { User } from "./types";
import { canCreatePost, canDeleteComment, canManageEvent } from "./permissions";

const owner: User = { id: "owner", displayName: "Owner", role: "owner" };
const uploader: User = { id: "uploader", displayName: "Uploader", role: "uploader" };
const viewer: User = { id: "viewer", displayName: "Viewer", role: "viewer" };

describe("permissions", () => {
  it("ownerだけがイベントを管理できる", () => {
    expect(canManageEvent(owner)).toBe(true);
    expect(canManageEvent(uploader)).toBe(false);
    expect(canManageEvent(viewer)).toBe(false);
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
});

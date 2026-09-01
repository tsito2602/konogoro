import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../../shared/types";
import { canAccessPath } from "./AppLayout";

const viewer: CurrentUser = { id: "viewer", displayName: "Viewer", role: "viewer" };
const uploader: CurrentUser = { id: "uploader", displayName: "Uploader", role: "uploader" };

describe("canAccessPath", () => {
  it.each(["/posts/new", "/events/new", "/events/event-1/edit", "/family"])("viewerの管理ルート%sを拒否する", (pathname) => {
    expect(canAccessPath(viewer, pathname)).toBe(false);
  });

  it.each(["/", "/events", "/events/event-1", "/posts/post-1", "/posts/post-1/media/media-1", "/settings"])("viewerの閲覧ルート%sを許可する", (pathname) => {
    expect(canAccessPath(viewer, pathname)).toBe(true);
  });

  it("uploaderは投稿画面だけ利用できる", () => {
    expect(canAccessPath(uploader, "/posts/new")).toBe(true);
    expect(canAccessPath(uploader, "/events/new")).toBe(false);
    expect(canAccessPath(uploader, "/events/event-1/edit")).toBe(false);
    expect(canAccessPath(uploader, "/family")).toBe(false);
  });
});

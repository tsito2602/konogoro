import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../../shared/types";
import { canAccessPath } from "./AppLayout";

const viewer: CurrentUser = { id: "viewer", displayName: "Viewer", role: "viewer" };
const uploader: CurrentUser = { id: "uploader", displayName: "Uploader", role: "uploader" };
const manageRoutes = ["/posts/new", "/posts/post-1/edit", "/events/new", "/events/event-1/edit"];

describe("canAccessPath", () => {
  it("viewerは閲覧ルートだけ、uploaderは家族の招待以外の管理ルートも開ける", () => {
    for (const pathname of ["/", "/events/event-1", "/posts/post-1/media/media-1", "/settings"]) {
      expect(canAccessPath(viewer, pathname)).toBe(true);
    }
    for (const pathname of [...manageRoutes, "/settings/family"]) {
      expect(canAccessPath(viewer, pathname)).toBe(false);
    }
    for (const pathname of manageRoutes) {
      expect(canAccessPath(uploader, pathname)).toBe(true);
    }
    expect(canAccessPath(uploader, "/settings/family")).toBe(false);
  });

  it("デザイン試作はステージングでのみ開ける", () => {
    expect(canAccessPath({ ...viewer, isStaging: true }, "/settings/design")).toBe(true);
    expect(canAccessPath({ ...uploader, role: "owner", isStaging: false }, "/settings/design")).toBe(false);
  });
});

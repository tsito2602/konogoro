import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CurrentUser } from "../../shared/types";
import { canAccessPath, LoginScreen } from "./AppLayout";

const viewer: CurrentUser = { id: "viewer", displayName: "Viewer", role: "viewer" };
const uploader: CurrentUser = { id: "uploader", displayName: "Uploader", role: "uploader" };

describe("canAccessPath", () => {
  it.each(["/posts/new", "/events/new", "/events/event-1/edit", "/family"])("viewerの管理ルート%sを拒否する", (pathname) => {
    expect(canAccessPath(viewer, pathname)).toBe(false);
  });

  it.each(["/", "/events", "/events/event-1", "/posts/post-1", "/posts/post-1/media/media-1", "/settings"])("viewerの閲覧ルート%sを許可する", (pathname) => {
    expect(canAccessPath(viewer, pathname)).toBe(true);
  });

  it("uploaderは投稿画面とイベント管理画面を利用できる", () => {
    expect(canAccessPath(uploader, "/posts/new")).toBe(true);
    expect(canAccessPath(uploader, "/events/new")).toBe(true);
    expect(canAccessPath(uploader, "/events/event-1/edit")).toBe(true);
    expect(canAccessPath(uploader, "/family")).toBe(false);
  });
});

describe("LoginScreen", () => {
  it("正式アイコンとLINEログイン導線を表示する", () => {
    const html = renderToStaticMarkup(createElement(LoginScreen));

    expect(html).toContain('/icons/icon-light-192.png');
    expect(html).toContain("このごろ");
    expect(html).toContain('href="/api/auth/line"');
  });
});

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CurrentUser } from "../../shared/types";
import { BootScreen, canAccessPath, LoginScreen, mainNavigationItems, outletKey, postCreatePath } from "./AppLayout";

const viewer: CurrentUser = { id: "viewer", displayName: "Viewer", role: "viewer" };
const uploader: CurrentUser = { id: "uploader", displayName: "Uploader", role: "uploader" };

describe("canAccessPath", () => {
  it("デザイン試作はステージングでのみ利用できる", () => {
    expect(canAccessPath({ ...viewer, isStaging: true }, "/settings/design")).toBe(true);
    expect(canAccessPath({ ...uploader, role: "owner", isStaging: false }, "/settings/design")).toBe(false);
    expect(canAccessPath(viewer, "/settings/design")).toBe(false);
  });
  it.each(["/posts/new", "/posts/post-1/edit", "/events/new", "/events/event-1/edit", "/settings/family"])(
    "viewerの管理ルート%sを拒否する",
    (pathname) => {
      expect(canAccessPath(viewer, pathname)).toBe(false);
    },
  );

  it.each([
    "/",
    "/unread",
    "/events",
    "/events/event-1",
    "/posts/post-1",
    "/posts/post-1/media/media-1",
    "/settings",
    "/family",
  ])("viewerの閲覧ルート%sを許可する", (pathname) => {
    expect(canAccessPath(viewer, pathname)).toBe(true);
  });

  it("uploaderは投稿画面とイベント管理画面を利用できる", () => {
    expect(canAccessPath(uploader, "/posts/new")).toBe(true);
    expect(canAccessPath(uploader, "/posts/post-1/edit")).toBe(true);
    expect(canAccessPath(uploader, "/events/new")).toBe(true);
    expect(canAccessPath(uploader, "/events/event-1/edit")).toBe(true);
    expect(canAccessPath(uploader, "/family")).toBe(true);
    expect(canAccessPath(uploader, "/settings/family")).toBe(false);
  });
});

describe("投稿追加URL", () => {
  it("イベント詳細ではイベントを引き継ぐ", () => {
    expect(postCreatePath("/events/event-1")).toBe("/posts/new?event=event-1");
  });

  it("通常画面ではイベントを指定しない", () => {
    expect(postCreatePath("/")).toBe("/posts/new");
    expect(postCreatePath("/events")).toBe("/posts/new");
  });
});

describe("mainNavigationItems", () => {
  it("タイムラインの未閲覧導線と投稿・コメントのお知らせを区別する", () => {
    expect(mainNavigationItems.map(({ to, label }) => [to, label])).toEqual([
      ["/", "タイムライン"],
      ["/activity", "お知らせ"],
      ["/events", "イベント"],
      ["/album", "アルバム"],
      ["/settings", "設定"],
    ]);
    expect(mainNavigationItems.every((item) => item.description.length > 0)).toBe(true);
  });
});

describe("LoginScreen", () => {
  it("正式アイコンとLINEログイン導線を表示する", () => {
    const html = renderToStaticMarkup(createElement(LoginScreen));

    expect(html).toContain("/icons/icon-light-transparent.png");
    expect(html).toContain("/icons/icon-dark-transparent.png");
    expect(html).toContain('class="login-icon login-icon-dark"');
    expect(html).toContain("このごろ");
    expect(html).toContain("日々のひとこまを、<br/>おすそわけ。");
    expect(html).toContain(
      "「この頃、何してるかな。」ふと気になる日々の様子が、招待された家族にだけ、そっと届きます。",
    );
    expect(html).toContain('href="/api/auth/line"');
  });

  it("現在の画面をLINEログイン後の遷移先として渡す", () => {
    const html = renderToStaticMarkup(createElement(LoginScreen, { returnTo: "/posts/post-1?from=line" }));

    expect(html).toContain('href="/api/auth/line?returnTo=%2Fposts%2Fpost-1%3Ffrom%3Dline"');
  });

  it("LINE通知から開いた新着閲覧画面へログイン後に戻れる", () => {
    const html = renderToStaticMarkup(createElement(LoginScreen, { returnTo: "/unread" }));

    expect(html).toContain('href="/api/auth/line?returnTo=%2Funread"');
  });
});

describe("BootScreen", () => {
  it("PWA起動中も正式アイコンとアプリ名を表示する", () => {
    const html = renderToStaticMarkup(createElement(BootScreen));

    expect(html).toContain('class="boot-symbol boot-symbol-light"');
    expect(html).toContain('class="boot-symbol boot-symbol-dark"');
    expect(html).toContain("このごろ");
    expect(html).toContain('role="status"');
  });
});

describe("viewer route identity", () => {
  it("preserves the viewer across media and post navigation", () => {
    expect(outletKey("/posts/p1/media/m1", "first")).toBe(outletKey("/posts/p1/media/m2", "next"));
    expect(outletKey("/posts/p1/media/m1", "first")).toBe(outletKey("/posts/p2/media/m3", "album-next"));
  });
  it("still resets normal pages and starts a fresh viewer after leaving", () => {
    expect(outletKey("/posts/p1", "detail")).toBe("detail");
    expect(outletKey("/album", "album")).not.toBe(outletKey("/posts/p1/media/m1", "viewer"));
  });
});

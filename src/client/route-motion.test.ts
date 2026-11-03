import { describe, expect, it } from "vitest";
import { crossFades } from "./route-motion";

describe("crossFades", () => {
  it("ページ内のリンクで別のページへ進むときだけ重ねて切り替える", () => {
    expect(crossFades("/events", "/events/abc", { dock: false })).toBe(true);
    expect(crossFades("/settings", "/settings/family", { dock: false })).toBe(true);
  });
  it("ボトムナビ、置き換え、投稿のシート、写真ビューアーでは使わない", () => {
    expect(crossFades("/", "/events", { dock: true })).toBe(false);
    expect(crossFades("/events", "/events/abc", { dock: false, replace: true })).toBe(false);
    expect(crossFades("/", "/posts/abc", { dock: false, postPage: true })).toBe(false);
    expect(crossFades("/posts/abc", "/posts/abc/media/m1", { dock: false })).toBe(false);
    expect(crossFades("/posts/abc/media/m1", "/events", { dock: false })).toBe(false);
    expect(crossFades("/events", "/events", { dock: false })).toBe(false);
  });
});

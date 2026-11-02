import { describe, expect, it } from "vitest";
import { appVersionOf, entryScript, isNewBuild } from "./app-update";

const html = (script: string) =>
  `<!doctype html><html><head><meta name="app-version" content="1.2.0" /><script type="module" crossorigin src="${script}"></script></head></html>`;

describe("app-update", () => {
  it("配信中の index.html から入口スクリプトとバージョンを読む", () => {
    expect(entryScript(html("/assets/index-B_I-tV8r.js"))).toBe("/assets/index-B_I-tV8r.js");
    expect(appVersionOf(html("/assets/index-B_I-tV8r.js"))).toBe("1.2.0");
    expect(entryScript("<html><script>inline()</script></html>")).toBe("");
  });

  it("入口スクリプトが変わったときだけ新しい配信とみなす", () => {
    expect(isNewBuild("/assets/index-a.js", "/assets/index-b.js")).toBe(true);
    expect(isNewBuild("/assets/index-a.js", "/assets/index-a.js")).toBe(false);
    // 取得失敗やログイン画面などで入口が読めない場合は知らせない。
    expect(isNewBuild("/assets/index-a.js", "")).toBe(false);
    expect(isNewBuild("/assets/index-a.js", "/src/client/main.tsx")).toBe(false);
  });
});

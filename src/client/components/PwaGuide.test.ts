import { describe, expect, it } from "vitest";
import { detectPwaEnvironment, installGuideContent, onboardingGuideSlides } from "./PwaGuide";

describe("detectPwaEnvironment", () => {
  it("インストール済みPWAを端末より優先して判定する", () => {
    expect(detectPwaEnvironment("iPhone Line/15.0", true)).toBe("installed");
  });

  it.each([
    ["Mozilla/5.0 (iPhone) Line/15.0", "ios-line"],
    ["Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1", "ios-browser"],
    ["Mozilla/5.0 (Linux; Android 16) Line/15.0", "android-line"],
    ["Mozilla/5.0 (Linux; Android 16) Chrome/140.0", "android-browser"],
  ] as const)("%sを%sと判定する", (userAgent, expected) => {
    expect(detectPwaEnvironment(userAgent, false)).toBe(expected);
  });
});

describe("installGuideContent", () => {
  it("iPhoneのLINE内ブラウザではSafariで開くところから案内する", () => {
    const content = installGuideContent("ios-line");
    expect(content.steps.join(" ")).toContain("デフォルトのブラウザで開く");
    expect(content.steps.join(" ")).toContain("ホーム画面に追加");
  });

  it("インストール済みの場合は追加手順を表示しない", () => {
    expect(installGuideContent("installed").steps).toEqual([]);
  });
});

describe("onboardingGuideSlides", () => {
  it("主要機能を画像付きページとして案内する", () => {
    const slides = onboardingGuideSlides();
    expect(slides.map(({ visual }) => visual)).toEqual(["welcome", "timeline", "events", "album", "comments", "line"]);
    expect(slides.every(({ titleLines, body }) => titleLines.length > 0 && body.length > 0)).toBe(true);
  });
});

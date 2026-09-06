import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoBadge, formatVideoDuration } from "./VideoBadge";

describe("動画の長さ", () => {
  it("未取得・不正値は0秒に見せない", () => {
    for (const seconds of [null, undefined, NaN, Infinity, -1]) {
      expect(formatVideoDuration(seconds)).toBeNull();
      expect(renderToStaticMarkup(<VideoBadge durationSeconds={seconds} />)).not.toContain("0:00");
    }
  });
  it("秒、分、時間を表示する", () => {
    expect(formatVideoDuration(9.9)).toBe("0:09");
    expect(formatVideoDuration(65)).toBe("1:05");
    expect(formatVideoDuration(3665)).toBe("1:01:05");
  });
});

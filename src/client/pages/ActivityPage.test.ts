import { describe, expect, it } from "vitest";
import type { Activity } from "../../shared/types";
import { activityText, appendUniqueActivities, formatLastViewedAt } from "./ActivityPage";

const activity = (id: string, kind: Activity["kind"]): Activity => ({ id, kind, occurredAt: "2026-09-01T00:00:00.000Z", actorId: "user-1", actorName: "翼", postId: "post-1", postLabel: "お土産", body: kind === "comment" ? "きれい" : null, thumbnailUrl: null });

describe("activity feed", () => {
  it("種類ごとの近況文を表示する", () => {
    expect(activityText(activity("1", "post"))).toBe("翼さんが「お土産」に写真・動画を投稿しました");
    expect(activityText(activity("2", "comment"))).toBe("翼さんが「お土産」にコメントしました");
  });

  it("セクションもイベントもない投稿には汎用文を表示する", () => {
    expect(activityText({ ...activity("1", "post"), postLabel: "投稿" })).toBe("翼さんが写真・動画を投稿しました");
    expect(activityText({ ...activity("2", "comment"), postLabel: "投稿" })).toBe("翼さんが投稿にコメントしました");
  });

  it("追加読込時の重複を除く", () => {
    expect(appendUniqueActivities([activity("1", "post")], [activity("1", "post"), activity("2", "comment")]).map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("最終閲覧時刻を相対表示する", () => {
    const now = new Date("2026-09-02T00:00:00.000Z").getTime();
    expect(formatLastViewedAt(null, now)).toBe("まだ見ていない");
    expect(formatLastViewedAt("2026-09-01T23:57:00.000Z", now)).toBe("3分前");
    expect(formatLastViewedAt("2026-09-01T22:00:00.000Z", now)).toBe("2時間前");
    expect(formatLastViewedAt("2026-09-01T00:00:00.000Z", now)).toBe("昨日");
  });
});

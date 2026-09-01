import { describe, expect, it } from "vitest";
import type { Activity } from "../../shared/types";
import { activityText, appendUniqueActivities } from "./ActivityPage";

const activity = (id: string, kind: Activity["kind"]): Activity => ({ id, kind, occurredAt: "2026-09-01T00:00:00.000Z", actorId: "user-1", actorName: "翼", postId: "post-1", postTitle: "旅行", body: kind === "comment" ? "きれい" : null, thumbnailUrl: null });

describe("activity feed", () => {
  it("種類ごとの近況文を表示する", () => {
    expect(activityText(activity("1", "post"))).toBe("翼さんが「旅行」を投稿しました");
    expect(activityText(activity("2", "comment"))).toBe("翼さんが「旅行」にコメントしました");
    expect(activityText(activity("3", "view"))).toBe("翼さんが「旅行」をみたよ");
  });

  it("追加読込時の重複を除く", () => {
    expect(appendUniqueActivities([activity("1", "post")], [activity("1", "post"), activity("2", "view")]).map((item) => item.id)).toEqual(["1", "2"]);
  });
});

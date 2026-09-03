import { describe, expect, it } from "vitest";
import type { EventSummary } from "../../shared/types";
import { filterEvents, groupEvents, type EventFilters } from "./EventsPage";

const event = (
  id: string,
  title: string,
  startDate: string | null,
  endDate: string | null,
  description = "",
): EventSummary => ({
  id,
  title,
  description,
  startDate,
  endDate,
  coverUrl: null,
  coverSource: "auto",
  postCount: 0,
  photoCount: 0,
  videoCount: 0,
});

const filters = (overrides: Partial<EventFilters> = {}): EventFilters => ({
  keyword: "",
  from: "",
  to: "",
  status: "all",
  ...overrides,
});

const events = [
  event("ongoing", "家族旅行", "2026-09-01", "2026-09-03", "京都の思い出"),
  event("upcoming", "運動会", "2026-09-10", "2026-09-10", "学校行事"),
  event("undated", "誕生日会", null, null, "日程調整中"),
  event("past", "夏祭り", "2026-08-20", "2026-08-21", "花火"),
];

describe("event filters", () => {
  it("条件がなければ元の順番を維持する", () => {
    expect(filterEvents(events, filters(), "2026-09-02").map(({ id }) => id)).toEqual([
      "ongoing",
      "upcoming",
      "undated",
      "past",
    ]);
  });

  it("タイトルとメモをキーワードで絞り込む", () => {
    expect(filterEvents(events, filters({ keyword: "  家族  " }), "2026-09-02").map(({ id }) => id)).toEqual([
      "ongoing",
    ]);
    expect(filterEvents(events, filters({ keyword: "学校" }), "2026-09-02").map(({ id }) => id)).toEqual(["upcoming"]);
  });

  it("指定期間と重なるイベントだけを残す", () => {
    expect(
      filterEvents(events, filters({ from: "2026-09-03", to: "2026-09-10" }), "2026-09-02").map(({ id }) => id),
    ).toEqual(["ongoing", "upcoming"]);
    expect(filterEvents(events, filters({ to: "2026-08-20" }), "2026-09-02").map(({ id }) => id)).toEqual(["past"]);
  });

  it.each([
    ["ongoing", "ongoing"],
    ["upcoming", "upcoming"],
    ["undated", "undated"],
    ["past", "past"],
  ] as const)("%sの状態で絞り込む", (status, id) => {
    expect(filterEvents(events, filters({ status }), "2026-09-02").map((item) => item.id)).toEqual([id]);
  });

  it("複数条件をANDで適用する", () => {
    expect(
      filterEvents(
        events,
        filters({ keyword: "京都", from: "2026-09-02", to: "2026-09-04", status: "ongoing" }),
        "2026-09-02",
      ).map(({ id }) => id),
    ).toEqual(["ongoing"]);
    expect(filterEvents(events, filters({ keyword: "京都", status: "past" }), "2026-09-02")).toEqual([]);
  });
});

describe("event groups", () => {
  it("進行中と予定、日付未定、終了済みに分けて元の順番を保つ", () => {
    expect(
      groupEvents(events, "2026-09-02").map((group) => ({
        title: group.title,
        ids: group.events.map(({ id }) => id),
      })),
    ).toEqual([
      { title: "進行中・これから", ids: ["ongoing", "upcoming"] },
      { title: "日付未定", ids: ["undated"] },
      { title: "これまで", ids: ["past"] },
    ]);
  });

  it("該当するイベントがない区切りは表示対象から外す", () => {
    expect(groupEvents([events[3]], "2026-09-02").map(({ title }) => title)).toEqual(["これまで"]);
  });
});

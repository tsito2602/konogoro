import { describe, expect, it } from "vitest";
import { calendarDate, monthDays, previewRange, rangeRows, selectRangeDate } from "./date-range";

describe("event date range", () => {
  it("starts a fresh range then includes both endpoints, including a day trip", () => {
    const start = selectRangeDate({ startDate: "2026-09-01", endDate: "2026-09-03" }, "start", "2026-09-07");
    expect(start).toEqual({ startDate: "2026-09-07", endDate: "" });
    expect(selectRangeDate(start, "end", "2026-09-09")).toEqual({ startDate: "2026-09-07", endDate: "2026-09-09" });
    expect(selectRangeDate(start, "end", "2026-09-07")).toEqual({ startDate: "2026-09-07", endDate: "2026-09-07" });
  });
  it("never creates an inverted range and supports empty or one-sided dates", () => {
    expect(selectRangeDate({ startDate: "2026-09-07", endDate: "" }, "end", "2026-08-30")).toEqual({
      startDate: "2026-08-30",
      endDate: "2026-09-07",
    });
    expect(selectRangeDate({ startDate: "", endDate: "2026-09-07" }, "end", "2026-09-01")).toEqual({
      startDate: "2026-09-01",
      endDate: "",
    });
  });
  it("previews an earlier second date without discarding the original anchor", () => {
    const single = { startDate: "2026-09-17", endDate: "" };
    const expected = { startDate: "2026-09-10", endDate: "2026-09-17" };
    expect(previewRange(single, "end", "2026-09-10")).toEqual(expected);
    expect(selectRangeDate(single, "end", "2026-09-10")).toEqual(expected);
    expect(previewRange(single, "end", "")).toEqual(single);
    expect(previewRange(single, "start", "2026-09-10")).toEqual(single);
  });
  it("draws one continuous capsule per week, clipped to the visible month", () => {
    const days = monthDays(2026, 8);
    expect(rangeRows(days, { startDate: "2026-09-10", endDate: "2026-09-17" })).toEqual([
      null,
      { first: 4, last: 6 },
      { first: 0, last: 4 },
      null,
      null,
      null,
    ]);
    expect(rangeRows(days, { startDate: "2026-08-30", endDate: "2026-09-02" })[0]).toEqual({ first: 2, last: 3 });
    expect(rangeRows(days, { startDate: "2026-09-10", endDate: "" }).every((row) => row === null)).toBe(true);
    expect(rangeRows(days, { startDate: "2026-09-10", endDate: "2026-09-10" })[1]).toEqual({ first: 4, last: 4 });
  });
  it("lays out leap years and months on a stable six-week calendar", () => {
    const leap = monthDays(2024, 1);
    expect(leap).toHaveLength(42);
    expect(leap[4]).toBe("2024-02-01");
    expect(leap.filter(Boolean)).toHaveLength(29);
    expect(monthDays(2025, 1).filter(Boolean)).toHaveLength(28);
    expect(monthDays(2026, 1)[0]).toBe("2026-02-01");
  });
  it("moves across year boundaries without local timezone shifts", () => {
    expect(calendarDate(2026, -1, 1)).toBe("2025-12-01");
    expect(calendarDate(2026, 11, 32)).toBe("2027-01-01");
    expect(calendarDate(2000, 1, 29)).toBe("2000-02-29");
  });
});

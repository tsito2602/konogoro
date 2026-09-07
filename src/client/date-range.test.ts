import { describe, expect, it } from "vitest";
import { calendarDate, monthDays, selectRangeDate } from "./date-range";

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
      endDate: "",
    });
    expect(selectRangeDate({ startDate: "", endDate: "2026-09-07" }, "end", "2026-09-01")).toEqual({
      startDate: "2026-09-01",
      endDate: "",
    });
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

export type DateRange = { startDate: string; endDate: string };

export function calendarDate(year: number, month: number, day: number): string {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date.toISOString().slice(0, 10);
}

export function monthDays(year: number, month: number): (string | null)[] {
  const first = new Date(`${calendarDate(year, month, 1)}T00:00:00Z`).getUTCDay();
  const count = Number(calendarDate(year, month + 1, 0).slice(8));
  return Array.from({ length: 42 }, (_, i) =>
    i >= first && i < first + count ? calendarDate(year, month, i - first + 1) : null,
  );
}

export function selectRangeDate(range: DateRange, phase: "start" | "end", date: string): DateRange {
  if (phase === "start" || !range.startDate || date < range.startDate) return { startDate: date, endDate: "" };
  return { startDate: range.startDate, endDate: date };
}

export function displayDate(value: string): string {
  if (!value) return "未設定";
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

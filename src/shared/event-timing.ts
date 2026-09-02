export type EventTiming = "ongoing" | "upcoming" | "undated" | "past";

export function eventTiming(startDate: string | null, endDate: string | null, today = todayInTokyo()): EventTiming {
  const firstDate = startDate ?? endDate;
  const lastDate = endDate ?? startDate;
  if (!firstDate || !lastDate) return "undated";
  if (today < firstDate) return "upcoming";
  if (today > lastDate) return "past";
  return "ongoing";
}

function todayInTokyo(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

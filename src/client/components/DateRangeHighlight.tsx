import { useLayoutEffect, useRef } from "react";
import { rangeRows, type DateRange } from "../date-range";

// These layers stay mounted so a new selection moves the existing geometry
// instead of replacing individual day backgrounds.
export function DateRangeHighlight({
  days,
  range,
  preview,
  anchorDate,
}: {
  days: (string | null)[];
  range: DateRange;
  preview: DateRange;
  anchorDate: string;
}) {
  const anchor = days.indexOf(anchorDate);
  const anchorRow = anchor < 0 ? (range.startDate < (days.find(Boolean) ?? "") ? 0 : 5) : Math.floor(anchor / 7);
  return (
    <div className="date-range-highlights" aria-hidden>
      {rangeRows(days, preview).map((segment, row) => {
        const origin = anchor < 0 ? (anchorRow === 0 ? 0 : 6) : Math.max(0, Math.min(6, anchor - row * 7));
        return (
          <span
            key={row}
            className="date-range-band"
            style={{
              top: 34 + row * 46 + 5,
              left: `calc(${(((segment?.first ?? origin) + 0.5) * 100) / 7}% - 18px)`,
              width: `calc(${segment ? ((segment.last - segment.first) * 100) / 7 : 0}% + 36px)`,
              opacity: segment ? 1 : 0,
              transitionDelay: segment ? `${Math.abs(row - anchorRow) * 55}ms` : "0ms",
            }}
          />
        );
      })}
      <DateMarker date={range.startDate} index={days.indexOf(range.startDate)} />
      <DateMarker
        date={range.endDate}
        index={range.endDate !== range.startDate ? days.indexOf(range.endDate) : -1}
        origin={anchor}
      />
    </div>
  );
}

function DateMarker({ date, index, origin = -1 }: { date: string; index: number; origin?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const positioned = useRef(false);
  const visible = useRef(false);
  useLayoutEffect(() => {
    const marker = ref.current!;
    if (index >= 0) {
      const position = (target: number) => {
        marker.style.left = `calc(${(((target % 7) + 0.5) * 100) / 7}% - 18px)`;
        marker.style.top = `${34 + Math.floor(target / 7) * 46 + 5}px`;
      };
      // Suppress travel from the top-left on initial mount / a newly visible month.
      if (!positioned.current || (!visible.current && origin >= 0)) {
        marker.style.transition = "none";
        position(positioned.current && origin >= 0 ? origin : index);
        void marker.offsetWidth;
        marker.style.transition = "";
      }
      position(index);
    }
    positioned.current = true;
    marker.style.opacity = index >= 0 ? "1" : "0";
    visible.current = index >= 0;
    // Preserve the last coordinates while fading out; do not fly to (0, 0).
  }, [index, origin]);
  return (
    <span ref={ref} className="date-range-marker">
      {date ? Number(date.slice(8)) : ""}
    </span>
  );
}

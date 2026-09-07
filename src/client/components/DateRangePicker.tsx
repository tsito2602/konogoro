import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { calendarDate, displayDate, monthDays, selectRangeDate, type DateRange } from "../date-range";
import "../date-range.css";

type Props = DateRange & { disabled?: boolean; onChange: (range: DateRange) => void };

export function DateRangePicker({ startDate, endDate, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="date-range-field">
      <span className="date-range-label">期間（任意）</span>
      <input type="hidden" name="startDate" value={startDate} />
      <input type="hidden" name="endDate" value={endDate} />
      <button
        className="date-range-trigger"
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`イベントの期間を選択。開始日 ${displayDate(startDate)}、終了日 ${displayDate(endDate)}`}
        onClick={() => setOpen(true)}
      >
        <CalendarDays aria-hidden />
        <span>
          <small>開始日</small>
          <strong>{displayDate(startDate)}</strong>
        </span>
        <span aria-hidden>—</span>
        <span>
          <small>終了日</small>
          <strong>{displayDate(endDate)}</strong>
        </span>
      </button>
      {open &&
        createPortal(
          <DateRangeDialog startDate={startDate} endDate={endDate} close={() => setOpen(false)} onChange={onChange} />,
          document.body,
        )}
    </div>
  );
}

function DateRangeDialog({ startDate, endDate, close, onChange }: Props & { close: () => void }) {
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const initial = startDate || endDate || todayValue;
  const [range, setRange] = useState<DateRange>({ startDate, endDate });
  const [phase, setPhase] = useState<"start" | "end">(startDate && !endDate ? "end" : "start");
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [cursor, setCursor] = useState(initial);
  const [hover, setHover] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  const focusDay = useRef(false);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const days = monthDays(year, monthIndex);
  const minYear = Math.min(1900, year);
  const maxYear = Math.max(today.getFullYear() + 10, year);
  const previewEnd = phase === "end" && hover >= range.startDate ? hover : range.endDate;

  useLayoutEffect(() => {
    const dialog = ref.current!;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-day][tabindex="0"]')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (!focusDay.current) return;
    ref.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus({ preventScroll: true });
    focusDay.current = false;
  }, [cursor, month]);

  const changeMonth = (value: string) => {
    setMonth(value);
    setCursor(`${value}-01`);
    setHover("");
  };
  const choose = (date: string) => {
    const next = selectRangeDate(range, phase, date);
    setRange(next);
    setPhase(next.endDate ? "start" : "end");
    setCursor(date);
    setHover("");
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let offset = offsets[event.key];
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (event.key === "Home") offset = -weekday;
    if (event.key === "End") offset = 6 - weekday;
    if (offset === undefined) return;
    event.preventDefault();
    const next = calendarDate(year, monthIndex, Number(date.slice(8)) + offset);
    if (next < "0001-01-01" || next > "9999-12-31") return;
    focusDay.current = true;
    setCursor(next);
    setMonth(next.slice(0, 7));
  };
  return (
    <dialog
      ref={ref}
      className="date-range-dialog"
      aria-labelledby="date-range-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
          close();
      }}
    >
      <header className="date-range-heading">
        <h2 id="date-range-title">イベントの期間</h2>
        <button type="button" className="icon-button" aria-label="期間の選択を閉じる" onClick={close}>
          <X />
        </button>
      </header>
      <div className="date-range-summary">
        {(["start", "end"] as const).map((part) => (
          <button
            type="button"
            key={part}
            aria-pressed={phase === part}
            onClick={() => {
              setPhase(part);
              setHover("");
            }}
          >
            <small>{part === "start" ? "開始日" : "終了日"}</small>
            <strong>{displayDate(part === "start" ? range.startDate : range.endDate)}</strong>
          </button>
        ))}
      </div>
      <div className="date-range-month">
        <button
          type="button"
          className="icon-button"
          aria-label="前の月"
          disabled={month === "0001-01"}
          onClick={() => changeMonth(calendarDate(year, monthIndex - 1, 1).slice(0, 7))}
        >
          <ChevronLeft />
        </button>
        <select
          aria-label="年を選択"
          value={year}
          onChange={(event) => changeMonth(`${event.target.value.padStart(4, "0")}-${month.slice(5)}`)}
        >
          {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map((value) => (
            <option key={value} value={value}>
              {value}年
            </option>
          ))}
        </select>
        <select
          aria-label="月を選択"
          value={monthIndex + 1}
          onChange={(event) => changeMonth(`${month.slice(0, 4)}-${event.target.value.padStart(2, "0")}`)}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => (
            <option key={value} value={value}>
              {value}月
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-button"
          aria-label="次の月"
          disabled={month === "9999-12"}
          onClick={() => changeMonth(calendarDate(year, monthIndex + 1, 1).slice(0, 7))}
        >
          <ChevronRight />
        </button>
      </div>
      <div
        className="date-range-grid"
        role="group"
        aria-label={`${year}年${monthIndex + 1}月の日付。矢印キーで移動できます`}
        onMouseLeave={() => setHover("")}
      >
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <span className="date-range-weekday" key={day} aria-hidden>
            {day}
          </span>
        ))}
        {days.map((date, i) => {
          if (!date) return <span key={i} />;
          const start = date === range.startDate;
          const end = date === range.endDate;
          const inRange = !!range.startDate && !!previewEnd && date >= range.startDate && date <= previewEnd;
          return (
            <button
              key={date}
              type="button"
              data-day={date}
              className={`date-range-day${inRange ? " in-range" : ""}${start ? " range-start" : ""}${date === previewEnd ? " range-end" : ""}`}
              tabIndex={date === cursor ? 0 : -1}
              aria-label={`${displayDate(date)}${start ? "、開始日" : ""}${end ? "、終了日" : ""}`}
              aria-pressed={start || end}
              aria-current={date === todayValue ? "date" : undefined}
              onKeyDown={(event) => keyDown(event, date)}
              onFocus={() => setCursor(date)}
              onMouseEnter={() => setHover(date)}
              onClick={() => choose(date)}
            >
              <span>{Number(date.slice(8))}</span>
            </button>
          );
        })}
      </div>
      <p className="date-range-hint" role="status">
        {phase === "end" && range.startDate
          ? "終了日を選択。同じ日なら日帰りです。"
          : range.endDate
            ? "この期間でよければ「決定」を押してください。"
            : "開始日を選択してください。"}
      </p>
      <footer className="date-range-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setRange({ startDate: "", endDate: "" });
            setPhase("start");
            setHover("");
          }}
        >
          クリア
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            onChange(range);
            close();
          }}
        >
          決定
        </button>
      </footer>
    </dialog>
  );
}

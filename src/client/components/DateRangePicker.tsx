import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { calendarDate, displayDate, monthDays, rangeRows, selectRangeDate, type DateRange } from "../date-range";
import { reduceMotion } from "../route-motion";
import "../date-range.css";
import "../date-panel.css";

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

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const SPRING = "cubic-bezier(.34,1.56,.64,1)";

/** 「11/15（日）」: the short form on the pills at the top of the panel. */
function shortDate(value: string): string {
  if (!value) return "選んで";
  const [year, month, day] = value.split("-").map(Number);
  const week = WEEK[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}（${week}）`;
}

// kondo の日付の粒（kondo src/web/date-picker.tsx の CalendarPanel）を移したもの。
// 上に開始日と終了日の丸い粒、大きな年月と丸い ‹ ›。選んだ日にインクの丸がはじけ、
// 2つの日のあいだにゼリーのような帯が伸び、今日は数字の下の短い線で示す。
function DateRangeDialog({ startDate, endDate, close, onChange }: Props & { close: () => void }) {
  const today = new Date();
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const initial = startDate || endDate || todayValue;
  const [range, setRange] = useState<DateRange>({ startDate, endDate });
  const [phase, setPhase] = useState<"start" | "end">(startDate && !endDate ? "end" : "start");
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [cursor, setCursor] = useState(initial);
  const ref = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const motion = useRef<{ slide?: number; pop?: string; band?: boolean }>({});
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  // Only the weeks the month takes (no empty sixth row under it).
  const all = monthDays(year, monthIndex);
  const lead = all.findIndex(Boolean);
  const days = all.slice(0, Math.ceil((lead + all.filter(Boolean).length) / 7) * 7);
  const minYear = Math.min(1900, year);
  const maxYear = Math.max(today.getFullYear() + 10, year);
  const count =
    range.startDate && range.endDate
      ? Math.round((Date.parse(range.endDate) - Date.parse(range.startDate)) / 864e5) + 1
      : null;

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
  useLayoutEffect(() => {
    const { slide, pop, band } = motion.current;
    motion.current = {};
    const node = grid.current;
    if (!node || reduceMotion() || typeof node.animate !== "function") return;
    if (slide)
      node.animate(
        [
          { transform: `translateX(${slide * 40}%)`, opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 380, easing: SPRING },
      );
    if (pop)
      node
        .querySelector(`[data-day="${pop}"] .dp-n`)
        ?.animate(
          [
            { transform: "scale(.3)" },
            { transform: "scale(1.18)", offset: 0.55 },
            { transform: "scale(.95)", offset: 0.8 },
            { transform: "none" },
          ],
          { duration: 460, easing: "ease-out" },
        );
    if (band)
      node
        .querySelectorAll(".dp-band")
        .forEach((el, index) =>
          el.animate(
            [{ transform: "scaleX(.1)" }, { transform: "scaleX(1.04)", offset: 0.7 }, { transform: "scaleX(1)" }],
            { duration: 520, delay: index * 70, easing: "cubic-bezier(.3,.9,.4,1)", fill: "backwards" },
          ),
        );
  });

  const changeMonth = (value: string, slide = 0) => {
    motion.current.slide = slide;
    setMonth(value);
    setCursor(`${value}-01`);
  };
  const step = (offset: number) => changeMonth(calendarDate(year, monthIndex + offset, 1).slice(0, 7), offset);
  const choose = (date: string) => {
    const next = selectRangeDate(range, phase, date);
    motion.current.pop = date;
    motion.current.band = Boolean(next.endDate);
    setRange(next);
    setPhase(next.endDate ? "start" : "end");
    setCursor(date);
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
        <button type="button" className="dp-round" aria-label="期間の選択を閉じる" onClick={close}>
          <X />
        </button>
      </header>
      <div className="dp">
        <div className="dp-ends">
          {(["start", "end"] as const).map((part, index) => {
            const date = part === "start" ? range.startDate : range.endDate;
            return (
              <Fragment key={part}>
                {index === 1 && <span className="dp-between">{count ? `${count}日間` : ""}</span>}
                <button
                  type="button"
                  className="dp-end"
                  aria-pressed={phase === part}
                  aria-label={`${part === "start" ? "開始日" : "終了日"} ${displayDate(date)}`}
                  data-empty={!date || undefined}
                  onClick={() => setPhase(part)}
                >
                  <small>{part === "start" ? "開始日" : "終了日"}</small>
                  <b>{shortDate(date)}</b>
                </button>
              </Fragment>
            );
          })}
        </div>
        <div className="dp-month">
          <b aria-live="polite">
            <label className="dp-pick">
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
              {year}
              <span>年</span>
            </label>
            <label className="dp-pick">
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
              {monthIndex + 1}
              <span>月</span>
            </label>
          </b>
          <button
            type="button"
            className="dp-round"
            aria-label="前の月"
            disabled={month === "0001-01"}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="dp-round"
            aria-label="次の月"
            disabled={month === "9999-12"}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </button>
        </div>
        <div className="dp-week" aria-hidden="true">
          {WEEK.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="dp-clip">
          <div
            className="dp-grid"
            ref={grid}
            role="group"
            aria-label={`${year}年${monthIndex + 1}月の日付。矢印キーで移動できます`}
          >
            {rangeRows(days, range).map((row, index) =>
              row && row.last > row.first ? (
                <span
                  key={index}
                  className="dp-band"
                  style={{
                    top: `calc(${index} * var(--dp-row))`,
                    left: `calc(${((row.first + 0.5) * 100) / 7}% - 20px)`,
                    width: `calc(${((row.last - row.first) * 100) / 7}% + 40px)`,
                  }}
                />
              ) : null,
            )}
            {days.map((date, i) => {
              if (!date) return <span key={i} />;
              const start = date === range.startDate;
              const end = date === range.endDate;
              return (
                <button
                  key={date}
                  type="button"
                  data-day={date}
                  className="dp-day"
                  tabIndex={date === cursor ? 0 : -1}
                  aria-label={`${displayDate(date)}${start ? "、開始日" : ""}${end ? "、終了日" : ""}`}
                  aria-pressed={start || end}
                  aria-current={date === todayValue ? "date" : undefined}
                  onKeyDown={(event) => keyDown(event, date)}
                  onFocus={() => setCursor(date)}
                  onClick={() => choose(date)}
                >
                  <span className="dp-n">{Number(date.slice(8))}</span>
                </button>
              );
            })}
          </div>
        </div>
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
          className="outline-button"
          onClick={() => {
            setRange({ startDate: "", endDate: "" });
            setPhase("start");
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

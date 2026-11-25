const TIME_SLOTS = [
  "08:00", "08:10", "08:20", "08:30", "08:40", "08:50",
  "09:00", "09:10", "09:20", "09:30", "09:40", "09:50",
  "10:00", "10:10", "10:20", "10:30", "10:40", "10:50",
  "11:00", "11:10", "11:20", "11:30", "11:40", "11:50",
  "12:00", "12:10", "12:20", "12:30", "12:40", "12:50",
  "13:00", "13:10", "13:20", "13:30", "13:40", "13:50",
  "14:00", "14:10", "14:20", "14:30", "14:40", "14:50",
  "15:00", "15:10", "15:20", "15:30", "15:40", "15:50",
  "16:00", "16:10", "16:20", "16:30", "16:40", "16:50",
  "17:00", "17:10", "17:20", "17:30", "17:40", "17:50",
  "18:00", "18:10", "18:20", "18:30", "18:40", "18:50",
  "19:00", "19:10", "19:20", "19:30", "19:40", "19:50",
  "20:00",
];

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getDefaultDuration(days: number[]): number {
  const hasMWF = days.some((d) => d === 1 || d === 3 || d === 5);
  const hasTTh = days.some((d) => d === 2 || d === 4);
  if (hasTTh && !hasMWF) return 80;
  return 50;
}

export function getEndTimeForStart(start: string, days: number[]): string {
  const duration = getDefaultDuration(days);
  const endMins = timeToMinutes(start) + duration;
  const clamped = Math.min(endMins, timeToMinutes("20:00"));
  return minutesToTime(clamped);
}

export function formatTime12(t: string | null | undefined): string {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return "Time not set";
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) {
    return "Time not set";
  }
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}


export function ScheduleTimeFields({ start, end, days, optional = false, onChange }: {
  start: string;
  end: string;
  days: number[];
  optional?: boolean;
  onChange: (start: string, end: string) => void;
}) {
  const selectClass = "mt-1 block h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const options = (value: string, slots: string[]) =>
    [...new Set([...slots, ...(value ? [value] : [])])].sort();

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs font-medium text-muted-foreground">
        Start time
        <select className={selectClass} value={start} onChange={(event) => {
          const next = event.target.value;
          onChange(next, next ? getEndTimeForStart(next, days) : "");
        }}>
          {(optional || !start) && <option value="">Time not set</option>}
          {options(start, TIME_SLOTS.slice(0, -1)).map((time) => <option key={time} value={time}>{formatTime12(time)}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        End time
        <select className={selectClass} value={end} disabled={!start} onChange={(event) => onChange(start, event.target.value)}>
          {(optional || !end) && <option value="">Time not set</option>}
          {options(end, TIME_SLOTS.filter((time) => timeToMinutes(time) > timeToMinutes(start))).map((time) => <option key={time} value={time} disabled={timeToMinutes(time) <= timeToMinutes(start)}>{formatTime12(time)}</option>)}
        </select>
      </label>
    </div>
  );
}

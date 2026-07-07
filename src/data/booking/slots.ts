import type { SlotDTO } from "./booking.dto";

const SOFIA_TZ = "Europe/Sofia";

export function todaySofia(): string {
  // en-CA форматира като "YYYY-MM-DD" — точно ISO формата, който базата и DTO-тата очакват
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SOFIA_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function weekdayOf(dateStr: string): number {
  // dateStr е чиста дата "YYYY-MM-DD" (без час) — денят от седмицата е еднакъв във всяка tz;
  // парсваме на UTC пладне, за да избегнем DST/edge отмествания при "new Date(dateStr)".
  const d = new Date(`${dateStr}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7; // JS: 0=нед…6=съб → домейн: 0=пон…6=нед
}

export function isPastDate(dateStr: string): boolean {
  return dateStr < todaySofia();
}

// ponytail: сравняваме до минута — booking.startTime/endTime винаги са цели минути,
// секундите в DB "time" колоните не носят допълнителна прецизност за тази логика.
function toMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  return as < be && bs < ae; // полу-отворени интервали — допиращи се НЕ се броят за overlap
}

export function addMinutes(time: string, mins: number): string {
  const total = toMinutes(time) + mins;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ponytail: не използва addMinutes (той wrap-ва %24) — тук трябва суров (non-wrapped)
// край, за да различим "не се събира в прозореца" от "прехвърля полунощ".
function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function generateDaySlots(input: {
  rules: { startTime: string; endTime: string }[];
  durationMinutes: number;
  blocked: boolean;
  confirmedFullDay: boolean;
  confirmedHourly: { startTime: string; endTime: string }[];
}): SlotDTO[] {
  if (input.blocked || input.confirmedFullDay) return [];
  const slots: SlotDTO[] = [];
  for (const rule of input.rules) {
    let cursorMin = toMinutes(rule.startTime);
    const limit = Math.min(toMinutes(rule.endTime), 1440); // не позволяваме слот да прехвърли полунощ
    while (true) {
      const endMin = cursorMin + input.durationMinutes; // суров край, без %24 wrap
      if (endMin > limit) break; // cursorMin строго расте до limit → гарантирано терминира
      const startTime = toHHMM(cursorMin);
      const endTime = toHHMM(endMin);
      const taken = input.confirmedHourly.some((b) => overlaps(startTime, endTime, b.startTime, b.endTime));
      if (!taken) slots.push({ startTime, endTime });
      cursorMin = endMin;
    }
  }
  return slots;
}

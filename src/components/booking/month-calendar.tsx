"use client";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailabilityDayDTO } from "@/data/booking/booking.dto";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0=пон…6=нед, огледа booking.availabilityRule.weekday

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
// ponytail: без date lib — Intl с timeZone дава коректен "днес" в Sofia независимо от клиентската tz.
// Ъпгрейд ако някога потрябва произволен друг tz: параметризирай timeZone вместо hardcode.
export function sofiaTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(new Date());
}

export function MonthCalendar({
  year,
  month, // 1-12
  days,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  days?: AvailabilityDayDTO[];
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}) {
  const t = useTranslations("Booking.calendar");
  const today = sofiaTodayStr();
  const stateByDate = useMemo(() => new Map((days ?? []).map((d) => [d.date, d.state])), [days]);

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const jsWeekday = firstOfMonth.getUTCDay(); // 0=Sun…6=Sat
  const leadBlanks = (jsWeekday + 6) % 7; // измести до 0=Mon…6=Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onPrevMonth}
          aria-label={t("prevMonth")}
        >
          <ChevronLeft />
        </Button>
        <p className="font-medium">{t("monthLabel", { year, month })}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={onNextMonth}
          aria-label={t("nextMonth")}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w}>{t(`weekday.${w}`)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const date = toDateStr(year, month, d);
          const state = stateByDate.get(date);
          const isToday = date === today;
          const isPast = date < today;
          const interactive = !!onSelectDate && !isPast;
          return (
            <button
              key={date}
              type="button"
              disabled={!interactive}
              onClick={() => onSelectDate?.(date)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={selectedDate === date}
              className={cn(
                "flex min-h-11 items-center justify-center rounded-md border text-sm tabular-nums transition-colors",
                isToday ? "border-primary font-semibold" : "border-border",
                state === "busy" && "bg-destructive/10 text-destructive",
                state === "free" && "bg-primary/5",
                selectedDate === date && "bg-primary text-primary-foreground",
                !interactive && "cursor-not-allowed opacity-50",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

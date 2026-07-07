"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MonthCalendar, sofiaTodayStr } from "@/components/booking/month-calendar";
import type { AvailabilityDayDTO } from "@/data/booking/booking.dto";

function currentSofiaYearMonth() {
  const today = sofiaTodayStr(); // "YYYY-MM-DD"
  const [y, m] = today.split("-");
  return { year: Number(y), month: Number(m) };
}

export function BlockedDatesManager({ listingId }: { listingId: string }) {
  const t = useTranslations("Booking.blockedDates");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [{ year, month }, setYm] = useState(currentSofiaYearMonth);
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const listQO = trpc.booking.vendorCalendar.blockedDate.list.queryOptions({ listingId });
  const { data: blocked } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });

  const create = useMutation(
    trpc.booking.vendorCalendar.blockedDate.create.mutationOptions({ onSuccess: invalidate, onError: () => setError(true) }),
  );
  const remove = useMutation(
    trpc.booking.vendorCalendar.blockedDate.remove.mutationOptions({ onSuccess: invalidate, onError: () => setError(true) }),
  );

  const days: AvailabilityDayDTO[] = (blocked ?? []).map((b) => ({ date: b.date, state: "busy" as const }));

  function toggle(date: string) {
    setError(false);
    const existing = blocked?.find((b) => b.date === date);
    if (existing) remove.mutate({ id: existing.id });
    else create.mutate({ listingId, date, note: note.trim() || undefined });
  }

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYm({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{t("title")}</h2>
      <div className="space-y-2">
        <Label htmlFor="bd-note">{t("noteLabel")}</Label>
        <Input id="bd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} maxLength={200} />
      </div>
      <MonthCalendar
        year={year}
        month={month}
        days={days}
        onSelectDate={toggle}
        onPrevMonth={() => shiftMonth(-1)}
        onNextMonth={() => shiftMonth(1)}
      />
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      {error && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
    </div>
  );
}

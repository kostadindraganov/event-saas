"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AvailabilityRuleDTO } from "@/data/booking/booking.dto";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0=пон…6=нед
type Row = { enabled: boolean; startTime: string; endTime: string };
const DEFAULT_ROW: Row = { enabled: false, startTime: "09:00", endTime: "18:00" };

function toHm(t: string) {
  return t.slice(0, 5); // "HH:MM:SS" → "HH:MM" за <input type="time">
}

function AvailabilityForm({ listingId, initialRules }: { listingId: string; initialRules: AvailabilityRuleDTO[] }) {
  const t = useTranslations("Booking.availability");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => {
    const byWeekday = new Map(initialRules.map((r) => [r.weekday, r]));
    return WEEKDAYS.map((w) => {
      const r = byWeekday.get(w);
      return r ? { enabled: true, startTime: toHm(r.startTime), endTime: toHm(r.endTime) } : { ...DEFAULT_ROW };
    });
  });
  const [error, setError] = useState<"invalid" | "generic" | null>(null);

  const getQO = trpc.booking.vendorCalendar.availability.get.queryOptions({ listingId });
  const setAvailability = useMutation(
    trpc.booking.vendorCalendar.availability.set.mutationOptions({
      onSuccess: () => { setError(null); void queryClient.invalidateQueries({ queryKey: getQO.queryKey }); toast.success(t("saved")); },
      onError: () => setError("generic"),
    }),
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const enabledRows = rows.map((r, weekday) => ({ ...r, weekday })).filter((r) => r.enabled);
    if (enabledRows.some((r) => r.startTime >= r.endTime)) { setError("invalid"); return; }
    setError(null);
    setAvailability.mutate({
      listingId,
      rules: enabledRows.map((r) => ({ weekday: r.weekday, startTime: `${r.startTime}:00`, endTime: `${r.endTime}:00` })),
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-lg font-medium">{t("title")}</h2>
      <div className="space-y-2">
        {WEEKDAYS.map((w) => {
          const row = rows[w]!; // rows has one entry per WEEKDAYS index by construction
          return (
            <div key={w} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <Switch
                checked={row.enabled}
                onCheckedChange={(v) => setRows((prev) => prev.map((r, i) => (i === w ? { ...r, enabled: v } : r)))}
              />
              <span className="w-28 text-sm font-medium">{t(`weekday.${w}`)}</span>
              {row.enabled && (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="h-11 w-auto"
                    value={row.startTime}
                    onChange={(e) => setRows((prev) => prev.map((r, i) => (i === w ? { ...r, startTime: e.target.value } : r)))}
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    className="h-11 w-auto"
                    value={row.endTime}
                    onChange={(e) => setRows((prev) => prev.map((r, i) => (i === w ? { ...r, endTime: e.target.value } : r)))}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error === "invalid" && <p role="alert" className="text-sm text-destructive">{t("errorInvalidRange")}</p>}
      {error === "generic" && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
      <Button type="submit" className="h-11" disabled={setAvailability.isPending}>
        {setAvailability.isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

export function AvailabilityEditor({ listingId }: { listingId: string }) {
  const trpc = useTRPC();
  const { data, isPending } = useQuery(trpc.booking.vendorCalendar.availability.get.queryOptions({ listingId }));
  if (isPending) return null;
  return <AvailabilityForm listingId={listingId} initialRules={data ?? []} />;
}

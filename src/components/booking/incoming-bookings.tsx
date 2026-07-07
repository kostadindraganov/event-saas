"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { BookingStatusBadge } from "@/components/booking/booking-status-badge";

function DeclineDialog({ id, onDeclined }: { id: string; onDeclined: () => void }) {
  const t = useTranslations("Booking.incoming");
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  const decline = useMutation(
    trpc.booking.decline.mutationOptions({
      onSuccess: () => { setOpen(false); setReason(""); onDeclined(); toast.success(t("declineSuccess")); },
      onError: () => setError(true),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(false); }}>
      <DialogTrigger asChild><Button variant="outline" className="h-11">{t("decline")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("declineConfirmTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(false); }} placeholder={t("reasonPlaceholder")} />
          {reason.length > 0 && reason.trim().length < 3 && (
            <p role="alert" className="text-sm text-destructive">{t("reasonRequired")}</p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{t("errorGeneric")}</p>}
        </div>
        <DialogFooter>
          <Button
            className="h-11"
            disabled={decline.isPending || reason.trim().length < 3}
            onClick={() => { setError(false); decline.mutate({ id, reason: reason.trim() }); }}
          >
            {decline.isPending ? t("declining") : t("declineSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IncomingBookings() {
  const t = useTranslations("Booking.incoming");
  const format = useFormatter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<"conflict" | "generic" | null>(null);

  const listQO = trpc.booking.vendorCalendar.incoming.queryOptions();
  const { data: bookings, isPending } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });

  const confirm = useMutation(
    trpc.booking.confirm.mutationOptions({
      onSuccess: () => { setErrorKey(null); invalidate(); toast.success(t("confirmSuccess")); },
      onError: (err) => setErrorKey(err.data?.code === "CONFLICT" ? "conflict" : "generic"),
    }),
  );

  if (isPending) return null;
  if (!bookings || bookings.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="font-medium">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{t("title")}</h2>
      {errorKey && (
        <p role="alert" className="text-sm text-destructive">
          {errorKey === "conflict" ? t("errorConflict") : t("errorGeneric")}
        </p>
      )}
      <div className="space-y-3">
        {bookings.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{b.listingTitle}</p>
                  <BookingStatusBadge status={b.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {b.customerName} · {format.dateTime(new Date(b.eventDate), { dateStyle: "medium" })}
                  {b.startTime && ` · ${b.startTime.slice(0, 5)}–${b.endTime?.slice(0, 5)}`}
                </p>
                <p className="text-sm text-muted-foreground">{b.serviceName} · {b.phone}</p>
                {b.message && <p className="mt-1 text-sm">{b.message}</p>}
              </div>
              {b.status === "pending" && (
                <div className="flex items-center gap-2">
                  <Button className="h-11" disabled={confirm.isPending} onClick={() => { setErrorKey(null); confirm.mutate({ id: b.id }); }}>
                    {confirm.isPending ? t("confirming") : t("confirm")}
                  </Button>
                  <DeclineDialog id={b.id} onDeclined={invalidate} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

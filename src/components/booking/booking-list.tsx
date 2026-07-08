"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BookingStatusBadge } from "@/components/booking/booking-status-badge";
import { ReviewForm } from "@/components/reviews/review-form";
import { sofiaTodayStr } from "@/components/booking/month-calendar";
import type { BookingDTO, BookingStatus } from "@/data/booking/booking.dto";

const CANCELLABLE = new Set<BookingStatus>(["pending", "confirmed"]);

function CancelDialog({ booking, onCancelled }: { booking: BookingDTO; onCancelled: () => void }) {
  const t = useTranslations("Booking.list");
  const trpc = useTRPC();
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: () => { onCancelled(); toast.success(t("cancelSuccess")); },
      onError: () => setError(true),
    }),
  );

  return (
    <AlertDialog onOpenChange={(o) => { if (!o) { setReason(""); setError(false); } }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">{t("cancel")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cancelConfirmTitle")}</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Textarea value={reason} onChange={(e) => { setReason(e.target.value); setError(false); }} placeholder={t("reasonPlaceholder")} />
          {error && <p role="alert" className="text-sm text-destructive">{t("errorGeneric")}</p>}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={reason.trim().length < 3 || cancel.isPending}
            onClick={() => cancel.mutate({ id: booking.id, reason: reason.trim() })}
          >
            {cancel.isPending ? t("cancelling") : t("cancelSubmit")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BookingList() {
  const t = useTranslations("Booking.list");
  const format = useFormatter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listQO = trpc.booking.listMine.queryOptions();
  const { data: bookings, isPending } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });
  const today = sofiaTodayStr();

  if (isPending) return null;
  if (!bookings || bookings.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="font-medium">{t("empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {bookings.map((b) => {
        const cancellable = CANCELLABLE.has(b.status) && b.eventDate >= today;
        return (
          <li key={b.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/obiava/${b.listingSlug}`} className="font-medium hover:underline">
                  {b.listingTitle}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {b.serviceName} · {format.dateTime(new Date(b.eventDate), { dateStyle: "medium" })}
                  {b.startTime && ` · ${b.startTime.slice(0, 5)}–${b.endTime?.slice(0, 5)}`}
                </p>
              </div>
              <BookingStatusBadge status={b.status} />
            </div>
            {b.declineReason && (
              <p className="mt-2 text-sm text-muted-foreground">{t("declineReasonLabel")}: {b.declineReason}</p>
            )}
            {cancellable && (
              <div className="mt-3">
                <CancelDialog booking={b} onCancelled={invalidate} />
              </div>
            )}
            {b.status === "completed" && (
              <div className="mt-3">
                <ReviewForm booking={b} editMode={b.hasReview} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

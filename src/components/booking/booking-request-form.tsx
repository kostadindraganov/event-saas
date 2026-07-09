"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthCalendar } from "@/components/booking/month-calendar";
import type { ServiceTypeDTO } from "@/data/booking/booking.dto";

export function PublicAvailabilityCalendar({ listingId }: { listingId: string }) {
  const t = useTranslations("Booking.calendar");
  const trpc = useTRPC();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data: days } = useQuery(trpc.booking.availability.month.queryOptions({ listingId, year, month }));

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth() + 1);
  }

  return (
    <div className="space-y-2">
      <MonthCalendar year={year} month={month} days={days ?? []} onPrevMonth={() => shiftMonth(-1)} onNextMonth={() => shiftMonth(1)} />
      <p className="text-xs text-muted-foreground">{t("legend")}</p>
    </div>
  );
}

export function BookingRequestForm({ listingId, serviceTypes }: { listingId: string; serviceTypes: ServiceTypeDTO[] }) {
  const t = useTranslations("Booking.request");
  const tc = useTranslations("Common");
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id ?? "");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [errorKey, setErrorKey] = useState<"conflict" | "selfBooking" | "tooManyRequests" | "generic" | null>(null);
  const [sent, setSent] = useState(false);

  const selected = serviceTypes.find((s) => s.id === serviceTypeId);
  const isHourly = selected?.kind === "hourly";

  const { data: slots } = useQuery(
    trpc.booking.slots.day.queryOptions(
      { listingId, serviceTypeId, date: eventDate },
      { enabled: isHourly && eventDate.length > 0 },
    ),
  );

  const request = useMutation(
    trpc.booking.request.mutationOptions({
      onSuccess: () => setSent(true),
      onError: (err) => {
        if (err.data?.code === "CONFLICT") setErrorKey("conflict");
        else if (err.data?.code === "FORBIDDEN") setErrorKey("selfBooking");
        else if (err.data?.code === "TOO_MANY_REQUESTS") setErrorKey("tooManyRequests");
        else setErrorKey("generic");
      },
    }),
  );

  if (serviceTypes.length === 0) return null;

  if (!session) {
    return (
      <div className="rounded-lg border border-border p-4">
        <Button asChild><Link href="/vhod">{t("loginToBook")}</Link></Button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-border p-4">
        <p className="font-medium">{t("successTitle")}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/profil/rezervacii">{t("viewBookings")}</Link>
        </Button>
      </div>
    );
  }

  const valid = eventDate.length > 0 && phone.trim().length >= 5 && (!isHourly || startTime.length > 0);

  return (
    <form
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrorKey(null);
        if (!valid) return;
        request.mutate({
          listingId,
          serviceTypeId,
          eventDate,
          ...(isHourly ? { startTime } : {}),
          phone: phone.trim(),
          message: message.trim() || undefined,
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="br-service">{t("serviceLabel")}</Label>
        <Select value={serviceTypeId} onValueChange={(v) => { setServiceTypeId(v); setStartTime(""); }}>
          <SelectTrigger id="br-service" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {serviceTypes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="br-date">{t("eventDateLabel")}</Label>
          <Input
            id="br-date"
            type="date"
            value={eventDate}
            onChange={(e) => { setEventDate(e.target.value); setStartTime(""); }}
            required
          />
        </div>
        {isHourly && (
          <div className="space-y-2">
            <Label htmlFor="br-slot">{t("slotLabel")}</Label>
            <Select value={startTime} onValueChange={setStartTime} disabled={!eventDate || !slots?.length}>
              <SelectTrigger id="br-slot" className="w-full"><SelectValue placeholder={t("slotPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {slots?.map((s) => (
                  <SelectItem key={s.startTime} value={s.startTime}>{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {eventDate && slots?.length === 0 && <p className="text-xs text-muted-foreground">{t("noSlots")}</p>}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="br-phone">{t("phoneLabel")}</Label>
        <Input id="br-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="br-message">{t("messageLabel")}</Label>
        <Textarea id="br-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={3} />
      </div>
      {errorKey && (
        <p role="alert" className="text-sm text-destructive">
          {errorKey === "conflict"
            ? t("errorConflict")
            : errorKey === "selfBooking"
              ? t("errorSelfBooking")
              : errorKey === "tooManyRequests"
                ? tc("tooManyRequests")
                : t("errorGeneric")}
        </p>
      )}
      <Button type="submit" className="h-11" disabled={!valid || request.isPending}>
        {request.isPending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}

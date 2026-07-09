"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { formatEuro, parseEuroToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ServiceTypeDTO, ServiceKind } from "@/data/booking/booking.dto";

function ServiceTypeFormDialog({
  listingId,
  serviceType,
  trigger,
  onSaved,
}: {
  listingId: string;
  serviceType?: ServiceTypeDTO;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const t = useTranslations("Booking.serviceType");
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ServiceKind>(serviceType?.kind ?? "full_day");
  const [name, setName] = useState(serviceType?.name ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    serviceType?.durationMinutes != null ? String(serviceType.durationMinutes) : "",
  );
  const [priceFromCents, setPriceFromCents] = useState(
    serviceType?.priceFromCents != null ? formatEuro(serviceType.priceFromCents) : "",
  );
  const [isActive, setIsActive] = useState(serviceType?.isActive ?? true);
  const [error, setError] = useState(false);

  // ponytail: две отделни useMutation (не ternary избор на mutationOptions) — union типа между
  // create/update input-и не се стеснява коректно от TS при runtime-избран mutationOptions.
  const onSaveSettled = {
    onSuccess: () => { setOpen(false); onSaved(); },
    onError: () => setError(true),
  };
  const create = useMutation(trpc.booking.vendorCalendar.serviceType.create.mutationOptions(onSaveSettled));
  const update = useMutation(trpc.booking.vendorCalendar.serviceType.update.mutationOptions(onSaveSettled));
  const save = serviceType ? update : create;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) { toast.error(t("nameInvalid")); return; }
    const duration = kind === "hourly" ? Number(durationMinutes) : null;
    if (kind === "hourly" && (!duration || duration <= 0)) { toast.error(t("durationInvalid")); return; }
    const cents = priceFromCents.trim() ? parseEuroToCents(priceFromCents) : null;
    if (priceFromCents.trim() && cents === null) { toast.error(t("priceInvalid")); return; }
    const base = { listingId, kind, name: trimmedName, durationMinutes: duration, priceFromCents: cents, isActive };
    if (serviceType) update.mutate({ id: serviceType.id, ...base });
    else create.mutate(base);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(false); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{serviceType ? t("edit") : t("add")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="st-kind">{t("kind")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ServiceKind)}>
              <SelectTrigger id="st-kind" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_day">{t("kindFullDay")}</SelectItem>
                <SelectItem value="hourly">{t("kindHourly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="st-name">{t("name")}</Label>
            <Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </div>
          {kind === "hourly" && (
            <div className="space-y-2">
              <Label htmlFor="st-duration">{t("duration")}</Label>
              <Input
                id="st-duration"
                type="number"
                min={1}
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="st-price">{t("price")}</Label>
            <Input
              id="st-price"
              inputMode="decimal"
              value={priceFromCents}
              onChange={(e) => setPriceFromCents(e.target.value)}
              placeholder={t("priceOptional")}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="st-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="st-active">{t("active")}</Label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
          <Button type="submit" className="h-11 w-full" disabled={save.isPending}>
            {save.isPending ? t("saving") : t("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServiceTypeManager({ listingId }: { listingId: string }) {
  const t = useTranslations("Booking.serviceType");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [errorKey, setErrorKey] = useState<"inUse" | "generic" | null>(null);

  const listQO = trpc.booking.vendorCalendar.serviceType.list.queryOptions({ listingId });
  const { data: serviceTypes } = useQuery(listQO);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: listQO.queryKey });

  const remove = useMutation(
    trpc.booking.vendorCalendar.serviceType.remove.mutationOptions({
      onSuccess: () => { setErrorKey(null); invalidate(); },
      onError: (err) => setErrorKey(err.data?.code === "CONFLICT" ? "inUse" : "generic"),
    }),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t("title")}</h2>
        <ServiceTypeFormDialog
          listingId={listingId}
          onSaved={invalidate}
          trigger={<Button className="h-11">{t("add")}</Button>}
        />
      </div>
      {errorKey && (
        <p role="alert" className="text-sm text-destructive">
          {errorKey === "inUse" ? t("errorInUse") : t("errorSave")}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {serviceTypes?.map((st) => (
          <Card key={st.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{st.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {st.kind === "hourly" ? t("kindHourly") : t("kindFullDay")}
                    {st.kind === "hourly" && st.durationMinutes != null && ` · ${st.durationMinutes} ${t("minutesShort")}`}
                  </p>
                </div>
                {!st.isActive && <span className="text-xs text-muted-foreground">{t("inactive")}</span>}
              </div>
              {st.priceFromCents != null && <p className="text-sm tabular-nums">{formatEuro(st.priceFromCents)}</p>}
              <div className="flex items-center gap-2">
                <ServiceTypeFormDialog
                  listingId={listingId}
                  serviceType={st}
                  onSaved={invalidate}
                  trigger={<Button variant="outline" size="default">{t("edit")}</Button>}
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="default" className="text-destructive">{t("remove")}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("removeConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("removeConfirmBody")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => { setErrorKey(null); remove.mutate({ id: st.id }); }}>
                        {t("remove")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

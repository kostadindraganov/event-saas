"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function IcalFeedCard() {
  const t = useTranslations("Booking.calendarPage");
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const feed = useQuery(trpc.booking.icalFeed.queryOptions());
  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.booking.icalFeed.queryKey() });

  const regenerate = useMutation(
    trpc.booking.regenerateIcalToken.mutationOptions({
      onSuccess: () => invalidate(),
      onError: () => toast.error(t("errorGeneric")),
    }),
  );
  const revoke = useMutation(
    trpc.booking.revokeIcalToken.mutationOptions({
      onSuccess: () => invalidate(),
      onError: () => toast.error(t("errorGeneric")),
    }),
  );

  const url = feed.data?.url ?? null;

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div>
          <p className="font-medium">{t("icalTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("icalDesc")}</p>
        </div>

        {url ? (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={url} className="h-11 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={copy}>
                {copied ? t("icalCopied") : t("icalCopy")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
                {t("icalRegenerate")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" className="h-11">{t("icalRevoke")}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("icalRevokeConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("icalRevokeConfirmDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("icalRevoke")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => revoke.mutate()}>{t("icalRevoke")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("icalNone")}</p>
            <Button type="button" className="h-11" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
              {t("icalGenerate")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

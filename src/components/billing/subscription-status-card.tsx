"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BillingOverviewDTO } from "@/data/billing/billing.dto";
import { DowngradeListingPicker } from "./downgrade-listing-picker";

type RestoreErrorKey = "generic" | "limitReached";

export function SubscriptionStatusCard({
  subscription,
  systemHidden,
}: {
  subscription: BillingOverviewDTO["subscription"];
  systemHidden: BillingOverviewDTO["systemHidden"];
}) {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const trpc = useTRPC();
  const router = useRouter();
  const [restoreError, setRestoreError] = useState<RestoreErrorKey | null>(null);
  // standard + >1 system-hidden → picker-ът е задължителен веднага (contract р.11); premium
  // over-limit случаят се разкрива само след LIMIT_REACHED от restore (виж onError по-долу).
  const [showPicker, setShowPicker] = useState(
    subscription?.plan === "standard" && systemHidden.length > 1,
  );

  const restore = useMutation(
    trpc.billing.restoreListings.mutationOptions({
      onSuccess: () => { setRestoreError(null); router.refresh(); },
      onError: (err) => {
        if (err.data?.code === "FORBIDDEN" && err.message === "LIMIT_REACHED") {
          setRestoreError("limitReached");
          setShowPicker(true);
        } else {
          setRestoreError("generic");
        }
      },
    }),
  );

  if (!subscription) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <p className="font-medium">{t("noSubscriptionTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("noSubscriptionHint")}</p>
        </CardContent>
      </Card>
    );
  }

  const graceDate = subscription.graceUntil
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(subscription.graceUntil))
    : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-serif text-xl">{t(`plans.${subscription.plan}.name`)}</p>
            <p className="text-sm text-muted-foreground">{t(`status.${subscription.status}`)}</p>
          </div>
          <Button className="h-11" variant="outline" onClick={() => { void authClient.customer.portal(); }}>
            {t("portalCta")}
          </Button>
        </div>
        {subscription.status === "past_due" && graceDate && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {t("pastDueWarning", { date: graceDate })}
          </p>
        )}
        {systemHidden.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {t("systemHiddenCount", { count: systemHidden.length })}
            </p>
            <Button className="h-11" disabled={restore.isPending} onClick={() => { setRestoreError(null); restore.mutate(); }}>
              {restore.isPending ? t("restoring") : t("restoreCta")}
            </Button>
            {restoreError && (
              <p role="alert" className="text-sm text-destructive">
                {t(restoreError === "limitReached" ? "restoreErrorLimit" : "restoreErrorGeneric")}
              </p>
            )}
          </div>
        )}
        {showPicker && <DowngradeListingPicker listings={systemHidden} />}
      </CardContent>
    </Card>
  );
}

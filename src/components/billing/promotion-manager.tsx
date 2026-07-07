"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ListingStatusBadge } from "@/components/vendor/listing-status-badge";
import type { MyPromotionListingDTO } from "@/data/billing/billing.dto";

type ActivateErrorKey = "limitReached" | "alreadyPromoted" | "premiumRequired" | "generic";

function ActivateRow({ listing }: { listing: MyPromotionListingDTO }) {
  const t = useTranslations("Billing.promo");
  const locale = useLocale();
  const trpc = useTRPC();
  const router = useRouter();
  const [errorKey, setErrorKey] = useState<ActivateErrorKey | null>(null);

  const activate = useMutation(
    trpc.billing.promotion.activate.mutationOptions({
      onSuccess: () => { setErrorKey(null); router.refresh(); },
      onError: (err) => {
        if (err.data?.code === "CONFLICT" && err.message === "ALREADY_PROMOTED") setErrorKey("alreadyPromoted");
        else if (err.data?.code === "FORBIDDEN" && err.message === "LIMIT_REACHED") setErrorKey("limitReached");
        else if (err.data?.code === "FORBIDDEN" && err.message === "PREMIUM_REQUIRED") setErrorKey("premiumRequired");
        else setErrorKey("generic");
      },
    }),
  );

  const endsDate = listing.promoEndsAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(listing.promoEndsAt))
    : null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{listing.title}</p>
          <ListingStatusBadge status={listing.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {listing.promoActive && endsDate ? t("activeUntil", { date: endsDate }) : t("inactive")}
        </p>
        {errorKey && (
          <p role="alert" className="text-sm text-destructive">
            {t(`error${errorKey[0]!.toUpperCase()}${errorKey.slice(1)}` as
              "errorLimitReached" | "errorAlreadyPromoted" | "errorPremiumRequired" | "errorGeneric")}
          </p>
        )}
      </div>
      <Button
        className="h-11"
        disabled={activate.isPending || listing.promoActive}
        onClick={() => { setErrorKey(null); activate.mutate({ listingId: listing.id }); }}
      >
        {activate.isPending ? t("activating") : t("activateCta")}
      </Button>
    </div>
  );
}

function CheckoutRow({ listing }: { listing: MyPromotionListingDTO }) {
  const t = useTranslations("Billing.promo");
  const locale = useLocale();
  const endsDate = listing.promoEndsAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(listing.promoEndsAt))
    : null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{listing.title}</p>
          <ListingStatusBadge status={listing.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {listing.promoActive && endsDate ? t("activeUntil", { date: endsDate }) : t("inactive")}
        </p>
      </div>
      <Button
        className="h-11"
        disabled={listing.promoActive}
        onClick={() => { void authClient.checkout({ slug: "promotion", referenceId: listing.id }); }}
      >
        {t("buyCta")}
      </Button>
    </div>
  );
}

export function PromotionManager({
  plan,
  promotions,
}: {
  plan: "standard" | "premium" | null;
  promotions: MyPromotionListingDTO[];
}) {
  const t = useTranslations("Billing.promo");
  const tGate = useTranslations("Billing.gate");

  if (promotions.length === 0) return null;

  if (!plan) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p className="text-sm text-muted-foreground">{t("noSubscriptionHint")}</p>
          <Button asChild className="h-11">
            <Link href="/profil/dostavchik/abonament">{tGate("cta")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        {promotions.map((listing) =>
          plan === "premium" ? (
            <ActivateRow key={listing.id} listing={listing} />
          ) : (
            <CheckoutRow key={listing.id} listing={listing} />
          ),
        )}
      </CardContent>
    </Card>
  );
}

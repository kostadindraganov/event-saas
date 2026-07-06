"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "yearly";
type PlanKey = "standard" | "premium";

// Polar checkout slugs — фиксирани в Задача 4 (checkout({ products: [...] })), НЕ цени в кода.
const CHECKOUT_SLUGS: Record<PlanKey, Record<Cycle, string>> = {
  standard: { monthly: "standard-monthly", yearly: "standard-yearly" },
  premium: { monthly: "premium-monthly", yearly: "premium-yearly" },
};

export function PlanPricingTable() {
  const t = useTranslations("Billing.plans");
  const { data: session } = authClient.useSession();
  const [cycle, setCycle] = useState<Cycle>("monthly");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-border p-1">
        {(["monthly", "yearly"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cycle === c}
            onClick={() => setCycle(c)}
            className={cn(
              "min-h-11 rounded-sm px-3 text-sm transition-colors",
              cycle === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(c)}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["standard", "premium"] as const).map((plan) => (
          <Card key={plan}>
            <CardHeader>
              <CardTitle>{t(`${plan}.name`)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                <li>{t(`${plan}.feature1`)}</li>
                <li>{t(`${plan}.feature2`)}</li>
                <li>{t(`${plan}.feature3`)}</li>
              </ul>
              <p className="text-xs text-muted-foreground">{t("priceHint")}</p>
              {session ? (
                <Button onClick={() => { void authClient.checkout({ slug: CHECKOUT_SLUGS[plan][cycle] }); }}>
                  {t("checkoutCta")}
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/vhod">{t("checkoutCta")}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

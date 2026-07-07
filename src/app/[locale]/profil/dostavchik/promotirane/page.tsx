import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/data/users/require-user";
import { BillingDAL } from "@/data/billing/billing.dal";
import { PromotionManager } from "@/components/billing/promotion-manager";

export default async function PromotiranePage({
  params,
}: {
  params: Promise<{ locale: "bg" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Billing.promo");
  const user = await requireUser();
  const [overview, promotions] = await Promise.all([
    BillingDAL.for(user).mine(locale),
    BillingDAL.for(user).myPromotions(locale),
  ]);

  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("pageTitle")}</h1>
      <PromotionManager plan={overview.subscription?.plan ?? null} promotions={promotions} />
    </main>
  );
}

import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/data/users/require-user";
import { BillingDAL } from "@/data/billing/billing.dal";
import { SubscriptionStatusCard } from "@/components/billing/subscription-status-card";
import { PlanPricingTable } from "@/components/billing/plan-pricing-table";

export default async function AbonamentPage({
  params,
}: {
  params: Promise<{ locale: "bg" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Billing");
  const user = await requireUser();
  const overview = await BillingDAL.for(user).mine(locale);

  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("pageTitle")}</h1>
      <SubscriptionStatusCard subscription={overview.subscription} systemHidden={overview.systemHidden} />
      <PlanPricingTable />
    </main>
  );
}

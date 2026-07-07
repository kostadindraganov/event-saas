import { getTranslations } from "next-intl/server";
import { caller } from "@/trpc/server";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const t = await getTranslations("Admin.dashboard");
  const stats = await caller.admin.dashboard.stats();

  const cards = [
    { label: t("pendingListings"), value: stats.pendingListings },
    { label: t("publishedListings"), value: stats.publishedListings },
    { label: t("users"), value: stats.users },
    { label: t("activeSubscriptions"), value: stats.activeSubscriptions },
    { label: t("activePromotions"), value: stats.activePromotions },
  ];

  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="font-serif text-2xl">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

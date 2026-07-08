import { getTranslations } from "next-intl/server";
import { ReportsQueue } from "@/components/admin/reports-queue";

export default async function AdminReportsPage() {
  const t = await getTranslations("Admin.reports");
  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <ReportsQueue />
    </main>
  );
}

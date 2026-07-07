import { getTranslations } from "next-intl/server";
import { ModerationQueue } from "@/components/admin/moderation-queue";

export default async function AdminListingsPage() {
  const t = await getTranslations("Admin.pending");
  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <ModerationQueue />
    </main>
  );
}

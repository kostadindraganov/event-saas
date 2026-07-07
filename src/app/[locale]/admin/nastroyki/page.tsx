import { getTranslations } from "next-intl/server";
import { SettingsForm } from "@/components/admin/settings-form";

export default async function AdminSettingsPage() {
  const t = await getTranslations("Admin.settings");
  return (
    <main className="max-w-xl space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <SettingsForm />
    </main>
  );
}

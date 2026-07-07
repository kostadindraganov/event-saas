import { getTranslations } from "next-intl/server";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";

export default async function AdminTaxonomyPage() {
  const t = await getTranslations("Admin.categories");
  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <TaxonomyManager />
    </main>
  );
}

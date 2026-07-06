import { setRequestLocale, getTranslations } from "next-intl/server";
import { SavedList } from "@/components/saved/saved-list";

export default async function IzbraniPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Saved");
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <SavedList />
    </div>
  );
}

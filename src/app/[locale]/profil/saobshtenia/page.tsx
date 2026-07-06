import { setRequestLocale, getTranslations } from "next-intl/server";
import { ThreadList } from "@/components/messaging/thread-list";

export default async function SaobshteniaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Messages");
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <ThreadList />
    </div>
  );
}

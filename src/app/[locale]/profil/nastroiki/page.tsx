import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteAccount } from "./delete-account";

export default async function NastroikiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Account");
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <Card>
        <CardContent className="space-y-2 p-6">
          <p className="font-medium">{t("exportTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("exportDesc")}</p>
          <Button asChild variant="outline" className="h-11">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API endpoint за file download (GDPR export), не страница */}
            <a href="/api/account/export">{t("exportButton")}</a>
          </Button>
        </CardContent>
      </Card>
      <DeleteAccount />
    </div>
  );
}

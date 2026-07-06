import { getTranslations } from "next-intl/server";
import { NewListingForm } from "@/components/vendor/new-listing-form";

export default async function NewListingPage() {
  const t = await getTranslations("Vendor");
  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("createTitle")}</h1>
      <NewListingForm />
    </main>
  );
}

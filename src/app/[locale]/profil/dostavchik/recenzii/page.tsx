import { getTranslations } from "next-intl/server";
import { requireUser } from "@/data/users/require-user";
import { VendorReviews } from "@/components/vendor/vendor-reviews";

export default async function VendorReviewsPage() {
  await requireUser();
  const t = await getTranslations("Vendor.reviewsPanel");
  return (
    <main className="space-y-6">
      <h1 className="font-serif text-3xl">{t("pageTitle")}</h1>
      <VendorReviews />
    </main>
  );
}

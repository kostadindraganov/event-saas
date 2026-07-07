import { setRequestLocale, getTranslations } from "next-intl/server";
import { BookingList } from "@/components/booking/booking-list";

export default async function RezervaciiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Booking.list");
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <BookingList />
    </div>
  );
}

import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/data/users/require-user";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ServiceTypeManager } from "@/components/booking/service-type-manager";
import { AvailabilityEditor } from "@/components/booking/availability-editor";
import { BlockedDatesManager } from "@/components/booking/blocked-dates-manager";
import { IncomingBookings } from "@/components/booking/incoming-bookings";

export default async function KalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "bg" | "en" }>;
  searchParams: Promise<{ obiava?: string }>;
}) {
  const { locale } = await params;
  const { obiava } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Booking.calendarPage");
  const user = await requireUser();
  const listings = await ListingDAL.for(user).listMine();
  const selectedId = listings.find((l) => l.id === obiava)?.id ?? listings[0]?.id ?? null;

  return (
    <main className="space-y-8">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <IncomingBookings />
      {listings.length === 0 ? (
        <p className="text-muted-foreground">{t("noListings")}</p>
      ) : (
        <>
          {listings.length > 1 && (
            <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
              {listings.map((l) => (
                <Link
                  key={l.id}
                  href={`/profil/dostavchik/kalendar?obiava=${l.id}`}
                  aria-current={l.id === selectedId ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-md px-3 text-sm",
                    l.id === selectedId
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground",
                  )}
                >
                  {l.title}
                </Link>
              ))}
            </nav>
          )}
          {selectedId && (
            <div className="space-y-8">
              <ServiceTypeManager listingId={selectedId} />
              <AvailabilityEditor listingId={selectedId} />
              <BlockedDatesManager listingId={selectedId} />
            </div>
          )}
        </>
      )}
    </main>
  );
}

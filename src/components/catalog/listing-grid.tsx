import type { PublicListingCardDTO } from "@/data/catalog/public.dto";
import { ListingCard } from "./listing-card";

export function ListingGrid({
  listings,
  locale,
}: {
  listings: PublicListingCardDTO[];
  locale: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} locale={locale} />
      ))}
    </div>
  );
}

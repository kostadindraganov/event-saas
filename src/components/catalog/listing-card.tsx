import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cfImageUrl } from "@/lib/cf-image-url";
import { formatEuro } from "@/lib/money";
import type { PublicListingCardDTO } from "@/data/catalog/public.dto";

export async function ListingCard({
  listing,
  locale,
}: {
  listing: PublicListingCardDTO;
  locale: string;
}) {
  const t = await getTranslations("Catalog");
  const coverUrl = listing.coverCfImageId ? cfImageUrl(listing.coverCfImageId) : null;
  const categoryName = locale === "bg" ? listing.categoryNameBg : listing.categoryNameEn;
  const location = listing.wholeCountry ? t("wholeCountry") : listing.cityName ?? "";

  return (
    <Link
      href={`/obiava/${listing.slug}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/25"
    >
      <div className="relative aspect-[4/3] w-full bg-muted">
        {coverUrl && (
          <Image
            src={coverUrl}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
          />
        )}
        {listing.reviewCount > 0 && listing.ratingAvg !== null && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-medium tabular-nums backdrop-blur">
            <Star className="size-3.5 fill-accent-gold text-accent-gold" />
            {listing.ratingAvg.toFixed(1)}
            <span className="text-muted-foreground">({listing.reviewCount})</span>
          </span>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-xs text-muted-foreground">
          {categoryName}
          {location && ` · ${location}`}
        </p>
        <h3 className="line-clamp-2 font-serif text-lg leading-snug">{listing.title}</h3>
        {listing.priceFromCents !== null && (
          <p className="text-sm tabular-nums">
            {t("priceFrom", { price: formatEuro(listing.priceFromCents) })}
          </p>
        )}
      </div>
    </Link>
  );
}

"use client";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { cfImageUrl } from "@/lib/cf-image-url";
import { formatEuro } from "@/lib/money";
import { SaveButton } from "@/components/saved/save-button";

export function SavedList() {
  const t = useTranslations("Catalog");
  const tSaved = useTranslations("Saved");
  const locale = useLocale();
  const trpc = useTRPC();
  const { data: listings, isPending, isError } = useQuery(trpc.saved.list.queryOptions());

  if (isPending) return null;
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {tSaved("errorLoad")}
      </p>
    );
  }
  if (!listings || listings.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="font-medium">{tSaved("empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tSaved("emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((listing) => {
        const coverUrl = listing.coverCfImageId ? cfImageUrl(listing.coverCfImageId) : null;
        const categoryName = locale === "bg" ? listing.categoryNameBg : listing.categoryNameEn;
        const location = listing.wholeCountry ? t("wholeCountry") : listing.cityName ?? "";
        return (
          <div
            key={listing.id}
            className="group relative overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/25"
          >
            <div className="absolute left-2 top-2 z-10">
              <SaveButton listingId={listing.id} />
            </div>
            <Link href={`/obiava/${listing.slug}`} className="block">
              <div className="relative aspect-[4/3] w-full bg-muted">
                {coverUrl && (
                  <Image
                    src={coverUrl}
                    alt={listing.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
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
          </div>
        );
      })}
    </div>
  );
}

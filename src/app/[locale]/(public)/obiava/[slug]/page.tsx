import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Star } from "lucide-react";
import { cachedListingBySlug } from "@/data/catalog/public-cached";
import { Badge } from "@/components/ui/badge";
import { ListingGallery } from "@/components/catalog/listing-gallery";
import { PackageCard } from "@/components/catalog/package-card";

export default async function ListingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const listing = await cachedListingBySlug(slug);
  if (!listing) notFound();

  const t = await getTranslations("Listing");
  const categoryName = locale === "bg" ? listing.categoryNameBg : listing.categoryNameEn;
  const location = listing.wholeCountry ? t("wholeCountry") : listing.cityName ?? "";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          {categoryName}
          {location && ` · ${location}`}
        </p>
        <h1 className="mt-1 font-serif text-4xl">{listing.title}</h1>
        {listing.reviewCount > 0 && listing.ratingAvg !== null && (
          <span className="mt-2 inline-flex items-center gap-1 text-sm tabular-nums">
            <Star className="size-4 fill-accent-gold text-accent-gold" />
            {listing.ratingAvg.toFixed(1)}
            <span className="text-muted-foreground">({listing.reviewCount})</span>
          </span>
        )}
      </header>

      {(listing.images.length > 0 || listing.videos.length > 0) && (
        <section className="mb-8">
          <ListingGallery images={listing.images} videos={listing.videos} title={listing.title} />
        </section>
      )}

      {listing.description && (
        <section className="mb-8">
          <h2 className="mb-2 font-serif text-2xl">{t("description")}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{listing.description}</p>
        </section>
      )}

      {listing.chips.length > 0 && (
        <section className="mb-8">
          <div className="flex flex-wrap gap-2">
            {listing.chips.flatMap((c) => {
              const label = locale === "bg" ? c.labelBg : c.labelEn;
              const values = locale === "bg" ? c.valuesBg : c.valuesEn;
              return values.map((v, i) => (
                <Badge key={`${c.definitionKey}-${i}`} variant="secondary" className="font-normal">
                  <span className="text-muted-foreground">{label}:</span>&nbsp;{v}
                </Badge>
              ));
            })}
          </div>
        </section>
      )}

      {listing.packages.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-2xl">{t("packages")}</h2>
          <div className="space-y-3">
            {listing.packages.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </div>
        </section>
      )}

      {listing.serviceRegionNames.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-serif text-2xl">{t("serviceArea")}</h2>
          <div className="flex flex-wrap gap-2">
            {listing.serviceRegionNames.map((r) => (
              <Badge key={r} variant="outline" className="font-normal">
                {r}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

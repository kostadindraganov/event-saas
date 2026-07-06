import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  cachedCategoryBySlug,
  cachedCityBySlug,
  cachedDefinitionsByCategory,
  cachedListingList,
} from "@/data/catalog/public-cached";
import { parseListParams } from "@/lib/catalog-search-params";
import { JsonLd } from "@/components/catalog/json-ld";
import { ListingGrid } from "@/components/catalog/listing-grid";
import { CatalogSort } from "@/components/catalog/catalog-sort";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { FiltersPanel, type FilterState } from "@/components/catalog/filters-panel";
import { buildLocalizedUrls, publicMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; category: string; city: string }>;
  searchParams: Promise<{ page?: string; [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, category: categorySlug, city: citySlug } = await params;
  const { page } = await searchParams;
  const [cat, city] = await Promise.all([
    cachedCategoryBySlug(categorySlug),
    cachedCityBySlug(citySlug),
  ]);
  if (!cat || !city) return {};
  const categoryName = locale === "en" ? cat.nameEn : cat.nameBg;
  const title =
    locale === "en" ? `${categoryName} in ${city.name}` : `${categoryName} в ${city.name}`;
  const description =
    locale === "en"
      ? `${categoryName} in ${city.name} — compare providers on EVENT-REVIEW.`
      : `${categoryName} в ${city.name} — сравни доставчици в EVENT-REVIEW.`;
  const meta = publicMetadata({
    locale,
    href: { pathname: "/[category]/[city]", params: { category: categorySlug, city: citySlug } },
    title,
    description,
  });
  const pageNum = Number(page) || 1;
  if (pageNum > 1) {
    return {
      ...meta,
      alternates: { ...meta.alternates, canonical: `${meta.alternates?.canonical}?page=${pageNum}` },
    };
  }
  return meta;
}

export default async function GeoLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; category: string; city: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, category: categorySlug, city: citySlug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const [category, city] = await Promise.all([
    cachedCategoryBySlug(categorySlug),
    cachedCityBySlug(citySlug),
  ]);
  if (!category || !city) notFound();

  const definitions = await cachedDefinitionsByCategory(category.id);
  const input = parseListParams(sp, category.id, definitions, { cityId: city.id });
  const result = await cachedListingList(input);

  const t = await getTranslations("Catalog");
  const categoryName = locale === "bg" ? category.nameBg : category.nameEn;
  const current: FilterState = {
    priceMinCents: input.priceMinCents,
    priceMaxCents: input.priceMaxCents,
    attrs: Object.fromEntries((input.attrs ?? []).map((a) => [a.definitionId, a.values])),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: locale === "en" ? "Home" : "Начало",
        item: buildLocalizedUrls({ pathname: "/" })[locale],
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryName,
        item: buildLocalizedUrls({ pathname: "/[category]", params: { category: category.slug } })[locale],
      },
      {
        "@type": "ListItem",
        position: 3,
        name: city.name,
        item: buildLocalizedUrls({
          pathname: "/[category]/[city]",
          params: { category: category.slug, city: citySlug },
        })[locale],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd} />
      <nav className="mb-3 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          {t("breadcrumbHome")}
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${categorySlug}`} className="hover:text-foreground">
          {categoryName}
        </Link>
        <span className="mx-1.5">/</span>
        <span aria-current="page" className="text-foreground">
          {city.name}
        </span>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl">
            {t("inCity", { category: categoryName, city: city.name })}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span>{t("resultsCount", { count: result.total })}</span>
            <Link href={`/${categorySlug}`} className="underline hover:text-foreground">
              {t("seeAllInCategory", { category: categoryName })}
            </Link>
          </div>
        </div>
        <CatalogSort sort={input.sort} />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <FiltersPanel definitions={definitions} current={current} hideCity />
        </div>
        <div className="min-w-0 flex-1">
          {result.items.length > 0 ? (
            <>
              <ListingGrid listings={result.items} locale={locale} />
              <div className="mt-8">
                <CatalogPagination
                  total={result.total}
                  page={result.page}
                  perPage={result.perPage}
                  basePath={`/${categorySlug}/${citySlug}`}
                  searchParams={sp}
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border py-16 text-center">
              <p className="font-serif text-2xl">{t("empty")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("emptyHint")}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

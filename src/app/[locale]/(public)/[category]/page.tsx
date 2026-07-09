import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cachedCategoryBySlug, cachedDefinitionsByCategory, cachedListingList, cachedListingCountByCity } from "@/data/catalog/public-cached";
import { parseListParams, parseView } from "@/lib/catalog-search-params";
import { JsonLd } from "@/components/catalog/json-ld";
import { ListingGrid } from "@/components/catalog/listing-grid";
import { ListingMap } from "@/components/catalog/listing-map";
import { ViewToggle } from "@/components/catalog/view-toggle";
import { CatalogSort } from "@/components/catalog/catalog-sort";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { FiltersPanel, type FilterState } from "@/components/catalog/filters-panel";
import { buildLocalizedUrls, publicMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; category: string }>;
  searchParams: Promise<{ page?: string; [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, category: categorySlug } = await params;
  const { page } = await searchParams;
  const cat = await cachedCategoryBySlug(categorySlug);
  if (!cat) return {};
  const title = locale === "en" ? cat.nameEn : cat.nameBg;
  const description =
    locale === "en"
      ? `Find and compare ${cat.nameEn} for your wedding on EVENT-REVIEW.`
      : `Намери и сравни доставчици на ${cat.nameBg} за твоята сватба в EVENT-REVIEW.`;
  const meta = publicMetadata({
    locale,
    href: { pathname: "/[category]", params: { category: categorySlug } },
    title,
    description,
  });
  const pageNum = Number(page) || 1;
  if (pageNum > 1) {
    // Google депрекира rel=prev/next (2019) — самостоятелен canonical на страница N е достатъчен;
    // няма отделни <link rel="prev"/"next"> тагове.
    return {
      ...meta,
      alternates: { ...meta.alternates, canonical: `${meta.alternates?.canonical}?page=${pageNum}` },
    };
  }
  return meta;
}

// (Невалиден `categorySlug` връща `{}` от `generateMetadata` — самата страница вика
// `notFound()` и определя реалния 404 отговор; празен `Metadata` обект тук не пречи.)

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, category: categorySlug } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const category = await cachedCategoryBySlug(categorySlug);
  if (!category) notFound();

  const definitions = await cachedDefinitionsByCategory(category.id);
  const input = parseListParams(sp, category.id, definitions);
  const result = await cachedListingList(input);
  const view = parseView(sp);
  const pins = view === "map" ? await cachedListingCountByCity(input) : [];

  const current: FilterState = {
    cityId: input.cityId,
    priceMinCents: input.priceMinCents,
    priceMaxCents: input.priceMaxCents,
    attrs: Object.fromEntries((input.attrs ?? []).map((a) => [a.definitionId, a.values])),
  };

  const t = await getTranslations("Catalog");
  const categoryName = locale === "bg" ? category.nameBg : category.nameEn;

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
        <span aria-current="page" className="text-foreground">
          {categoryName}
        </span>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl">{categoryName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("resultsCount", { count: result.total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} />
          <CatalogSort sort={input.sort} />
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <FiltersPanel definitions={definitions} current={current} />
        </div>
        <div className="min-w-0 flex-1">
          {view === "map" ? (
            <ListingMap pins={pins} mode="query" categorySlug={categorySlug} />
          ) : result.items.length > 0 ? (
            <>
              <ListingGrid listings={result.items} locale={locale} />
              <div className="mt-8">
                <CatalogPagination
                  total={result.total}
                  page={result.page}
                  perPage={result.perPage}
                  basePath={`/${categorySlug}`}
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

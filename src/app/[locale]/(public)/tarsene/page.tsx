import { getTranslations, setRequestLocale } from "next-intl/server";
import { TaxonomyDAL } from "@/data/catalog/taxonomy.dal";
import { cachedSearch } from "@/data/catalog/public-cached";
import { parsePage, PER_PAGE } from "@/lib/catalog-search-params";
import { ListingGrid } from "@/components/catalog/listing-grid";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { SearchHero } from "@/components/catalog/search-hero";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const q = (Array.isArray(sp.q) ? sp.q[0] ?? "" : sp.q ?? "").trim();
  const page = parsePage(sp);
  const [categories, t] = await Promise.all([
    TaxonomyDAL.public().listCategories(),
    getTranslations("Catalog"),
  ]);
  const result = q ? await cachedSearch(q, page, PER_PAGE) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-serif text-3xl">{t("searchTitle")}</h1>
      <div className="mt-4">
        <SearchHero categories={categories} />
      </div>

      {result && (
        <div className="mt-8">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("resultsForCount", { count: result.total, q })}
          </p>
          {result.items.length > 0 ? (
            <>
              <ListingGrid listings={result.items} locale={locale} />
              <div className="mt-8">
                <CatalogPagination
                  total={result.total}
                  page={result.page}
                  perPage={result.perPage}
                  basePath="/tarsene"
                  searchParams={sp}
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border py-16 text-center">
              <p className="font-serif text-2xl">{t("searchEmpty")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("searchHint")}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

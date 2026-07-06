import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { TaxonomyDAL } from "@/data/catalog/taxonomy.dal";
import { AttributeDAL } from "@/data/catalog/attribute.dal";
import { cachedListingList } from "@/data/catalog/public-cached";
import { parseListParams } from "@/lib/catalog-search-params";
import { ListingGrid } from "@/components/catalog/listing-grid";
import { CatalogSort } from "@/components/catalog/catalog-sort";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";

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

  const category = await TaxonomyDAL.public().categoryBySlug(categorySlug);
  if (!category) notFound();

  const definitions = await AttributeDAL.public().definitionsByCategory(category.id);
  const input = parseListParams(sp, category.id, definitions);
  const result = await cachedListingList(input);

  const t = await getTranslations("Catalog");
  const categoryName = locale === "bg" ? category.nameBg : category.nameEn;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
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
        <CatalogSort sort={input.sort} />
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Задача 10 монтира <FiltersPanel> тук */}
        <div className="min-w-0 flex-1">
          {result.items.length > 0 ? (
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

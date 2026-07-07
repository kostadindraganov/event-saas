import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cachedCategoriesWithCounts, cachedPromotedHome } from "@/data/catalog/public-cached";
import { getBillingSettings } from "@/data/billing/billing.dal";
import { Button } from "@/components/ui/button";
import { SearchHero } from "@/components/catalog/search-hero";
import { ListingCard } from "@/components/catalog/listing-card";
import { PromotedCarousel } from "@/components/catalog/promoted-carousel";
import { CarouselItem } from "@/components/ui/carousel";
import { publicMetadata } from "@/lib/seo";

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const title =
    locale === "en" ? "EVENT-REVIEW — Wedding services" : "EVENT-REVIEW — Сватбени услуги";
  const description =
    locale === "en"
      ? "Find and compare photographers, venues and other wedding service providers."
      : "Намери и сравни фотографи, зали и други доставчици на сватбени услуги.";
  return publicMetadata({ locale, href: { pathname: "/" }, title, description });
}

// ponytail: title/description са директни ternary-и по locale, не минават през next-intl messages —
// Catalog/Home namespace-ите от Задача 8/14 не са SEO-фокусирани и добавянето на нови message ключове
// тук би създало coupling с чужда задача извън обхвата на тази секция; ако маркетингът поиска
// редактируеми SEO текстове по-късно, migrira към messages.

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Home");
  const tb = await getTranslations("Billing");
  const categories = await cachedCategoriesWithCounts();
  const { promo } = await getBillingSettings();
  const promoted = await cachedPromotedHome(promo.carouselSize);

  return (
    <main>
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <h1 className="font-serif text-4xl sm:text-5xl">{t("heroTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{t("heroSubtitle")}</p>
          <div className="mx-auto mt-8 max-w-2xl text-left">
            <SearchHero categories={categories} />
          </div>
        </div>
      </section>

      {promoted.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="mb-6 font-serif text-2xl">{tb("promo.carouselTitle")}</h2>
          <PromotedCarousel
            prevLabel={tb("promo.carouselPrevSlide")}
            nextLabel={tb("promo.carouselNextSlide")}
          >
            {promoted.map((l) => (
              <CarouselItem key={l.id} className="basis-1/2 sm:basis-1/3 lg:basis-1/4">
                <ListingCard listing={l} locale={locale} />
              </CarouselItem>
            ))}
          </PromotedCarousel>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 font-serif text-2xl">{t("categoriesTitle")}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}`}
              className="group flex min-h-28 flex-col justify-between rounded-lg border border-border p-5 transition-colors hover:border-foreground/25"
            >
              <span className="font-serif text-lg">
                {locale === "bg" ? c.nameBg : c.nameEn}
              </span>
              <span className="mt-2 text-sm tabular-nums text-muted-foreground">
                {t("listingsCount", { count: c.publishedCount })}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-12 text-center">
          <h2 className="font-serif text-2xl">{t("ctaTitle")}</h2>
          <Button asChild size="lg">
            <Link href="/profil/dostavchik/obiavi">{t("ctaButton")}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

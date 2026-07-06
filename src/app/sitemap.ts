import type { MetadataRoute } from "next";
import { TaxonomyDAL } from "@/data/catalog/taxonomy.dal";
import { localizedSitemapEntry } from "@/lib/sitemap-urls";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const categories = await TaxonomyDAL.public().listCategories();
  const staticEntries: MetadataRoute.Sitemap = [
    { ...localizedSitemapEntry({ pathname: "/" }, now), priority: 1, changeFrequency: "daily" },
    { ...localizedSitemapEntry({ pathname: "/tarsene" }, now), changeFrequency: "weekly" },
  ];
  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    ...localizedSitemapEntry({ pathname: "/[category]", params: { category: c.slug } }, now),
    changeFrequency: "daily",
  }));
  // ponytail: /[category]/[city] гео landing страниците НЕ се enumerate-ват тук. TaxonomyDAL няма
  // list-all-cities метод (само searchCities с prefix+limit 10), а изброяване на всички
  // category×city комбинации би изисквало нов DAL метод извън contract.md обхвата на тази секция.
  // Гео страниците се достигат през crawl/inlinks от категорийната страница и остават индексируеми
  // (canonical + hreflang от Задача 15), просто не са sitemap-listed директно. Добави list-all-cities
  // + enumeration тук, ако гео landing-ите трябва да са sitemap-submitted изрично.
  return [...staticEntries, ...categoryEntries];
}

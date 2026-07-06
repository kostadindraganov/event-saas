import "server-only";
import { unstable_cache } from "next/cache";
import { ListingDAL } from "./listing.dal";
import { TaxonomyDAL } from "./taxonomy.dal";
import type { PublicListingFilterInput } from "./public.dto";

const HOUR = 3600;

export function cachedListingBySlug(slug: string) {
  return unstable_cache(
    () => ListingDAL.public().getBySlug(slug),
    ["listing-by-slug", slug],
    { tags: ["listings", `listing:${slug}`], revalidate: HOUR },
  )();
}

export function cachedListingList(input: PublicListingFilterInput) {
  return unstable_cache(
    () => ListingDAL.public().list(input),
    ["listing-list", JSON.stringify(input)],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

export function cachedSearch(q: string, page: number, perPage: number) {
  return unstable_cache(
    () => ListingDAL.public().search(q, page, perPage),
    ["listing-search", q, String(page), String(perPage)],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

export function cachedRecent(limit: number) {
  return unstable_cache(
    () => ListingDAL.public().recent(limit),
    ["listing-recent", String(limit)],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

export function cachedCategoryBySlug(slug: string) {
  return unstable_cache(
    () => TaxonomyDAL.public().categoryBySlug(slug),
    ["category-by-slug", slug],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

export function cachedCityBySlug(slug: string) {
  return unstable_cache(
    () => TaxonomyDAL.public().cityBySlug(slug),
    ["city-by-slug", slug],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

export function cachedRegionBySlug(slug: string) {
  return unstable_cache(
    () => TaxonomyDAL.public().regionBySlug(slug),
    ["region-by-slug", slug],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

export function cachedCategoriesWithCounts() {
  return unstable_cache(
    () => TaxonomyDAL.public().listCategoriesWithCounts(),
    ["categories-with-counts"],
    { tags: ["listings"], revalidate: HOUR },
  )();
}

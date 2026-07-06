import "server-only";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { category, city, listing, region } from "@/db/schema";

export class TaxonomyDAL {
  static public() {
    return new TaxonomyDAL();
  }

  async listCategories() {
    return db
      .select({ id: category.id, slug: category.slug, nameBg: category.nameBg, nameEn: category.nameEn })
      .from(category)
      .where(eq(category.isActive, true))
      .orderBy(asc(category.sortOrder));
  }

  async listRegions() {
    return db.select({ id: region.id, slug: region.slug, name: region.name }).from(region).orderBy(asc(region.name));
  }

  async searchCities(query: string) {
    return db
      .select({ id: city.id, name: city.name, regionName: region.name })
      .from(city)
      .innerJoin(region, eq(city.regionId, region.id))
      .where(ilike(city.name, `${query}%`))
      .orderBy(asc(city.name))
      .limit(10);
  }

  async categoryBySlug(slug: string) {
    const [row] = await db
      .select({ id: category.id, slug: category.slug, nameBg: category.nameBg, nameEn: category.nameEn })
      .from(category)
      .where(eq(category.slug, slug));
    return row ?? null;
  }

  async regionBySlug(slug: string) {
    const [row] = await db
      .select({ id: region.id, slug: region.slug, name: region.name })
      .from(region)
      .where(eq(region.slug, slug));
    return row ?? null;
  }

  async cityBySlug(slug: string) {
    const [row] = await db
      .select({ id: city.id, name: city.name, regionName: region.name })
      .from(city)
      .innerJoin(region, eq(city.regionId, region.id))
      .where(eq(city.slug, slug));
    return row ?? null;
  }

  async listCategoriesWithCounts() {
    return db
      .select({
        id: category.id,
        slug: category.slug,
        nameBg: category.nameBg,
        nameEn: category.nameEn,
        publishedCount: sql<number>`count(${listing.id}) filter (where ${listing.status} = 'published')`.mapWith(Number),
      })
      .from(category)
      .leftJoin(listing, eq(listing.categoryId, category.id))
      .where(eq(category.isActive, true))
      .groupBy(category.id)
      .orderBy(asc(category.sortOrder));
  }
}

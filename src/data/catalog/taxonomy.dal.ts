import "server-only";
import { asc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { category, city, region } from "@/db/schema";

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
}

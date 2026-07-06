import type { MetadataRoute } from "next";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { localizedSitemapEntry } from "@/lib/sitemap-urls";

const CHUNK_SIZE = 50_000;

export async function generateSitemaps() {
  const total = await ListingDAL.public().publishedCount();
  const chunks = Math.max(1, Math.ceil(total / CHUNK_SIZE));
  return Array.from({ length: chunks }, (_, id) => ({ id: String(id) }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const pageId = Number(await id);
  const listings = await ListingDAL.public().sitemapEntries(pageId * CHUNK_SIZE, CHUNK_SIZE);
  return listings.map((l) =>
    localizedSitemapEntry(
      { pathname: "/obiava/[slug]", params: { slug: l.slug } },
      new Date(l.publishedAt),
    ),
  );
}

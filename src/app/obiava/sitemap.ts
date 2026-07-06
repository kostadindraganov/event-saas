import type { MetadataRoute } from "next";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { localizedSitemapEntry } from "@/lib/sitemap-urls";

const CHUNK_SIZE = 50_000;

export async function generateSitemaps() {
  // ponytail: един chunk (id=0). ListingDAL.public().recent(limit) поддържа само limit, без offset —
  // multi-chunk пагинация не е възможна с текущия DAL surface (contract.md, Задачи 2-5). При >50k
  // публикувани обяви добави offset-базиран full-scan метод в PublicListingDAL и разшири масива тук.
  return [{ id: "0" }];
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  await id; // единствен chunk засега — стойността не участва в заявката (виж бележката по-горе)
  const listings = await ListingDAL.public().recent(CHUNK_SIZE);
  return listings.map((l) =>
    localizedSitemapEntry(
      { pathname: "/obiava/[slug]", params: { slug: l.slug } },
      new Date(l.publishedAt),
    ),
  );
}

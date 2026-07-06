import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/profil", "/api"] },
    // ponytail: /obiava/sitemap/0.xml е единственият chunk засега (виж obiava/sitemap.ts) — ако
    // generateSitemaps там някога върне >1 id, добави съответните индекси тук.
    sitemap: [`${base}/sitemap.xml`, `${base}/obiava/sitemap/0.xml`],
  };
}

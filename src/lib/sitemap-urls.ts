import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { buildLocalizedUrls, type LocalizedHref } from "@/lib/seo";

export function localizedSitemapEntry(
  href: LocalizedHref,
  lastModified: Date,
): MetadataRoute.Sitemap[number] {
  const urls = buildLocalizedUrls(href);
  return {
    // noUncheckedIndexedAccess: safe — urls is populated for every routing.locales entry above.
    url: urls[routing.defaultLocale]!,
    lastModified,
    alternates: { languages: urls },
  };
}

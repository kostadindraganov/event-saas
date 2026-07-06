import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export type LocalizedHref = { pathname: string; params?: Record<string, string> };

/** URL-и на една логическа страница на всеки конфигуриран locale, ключувани по locale код. */
export function buildLocalizedUrls(href: LocalizedHref): Record<string, string> {
  const base = getBaseUrl();
  // ponytail: routing.ts has no `pathnames` map, so next-intl's getPathname only
  // accepts a *final* string href (per next-intl docs) — the `{pathname, params}`
  // object form is only for when `pathnames` is configured. Substitute params
  // ourselves before handing a plain string to getPathname.
  const resolvedPathname = href.params
    ? Object.entries(href.params).reduce(
        (acc, [key, value]) => acc.replace(`[${key}]`, value),
        href.pathname,
      )
    : href.pathname;
  const urls: Record<string, string> = {};
  for (const locale of routing.locales) {
    urls[locale] = `${base}${getPathname({ locale, href: resolvedPathname })}`;
  }
  return urls;
}

export function publicMetadata(opts: {
  locale: string;
  href: LocalizedHref;
  title: string;
  description: string;
  ogImage?: string;
  noindex?: boolean;
}): Metadata {
  const { locale, href, title, description, ogImage, noindex } = opts;
  const urls = buildLocalizedUrls(href);
  // noUncheckedIndexedAccess: safe — urls is populated for every routing.locales entry above.
  const canonical = urls[locale]!;
  const languages: Record<string, string> = { ...urls, "x-default": urls[routing.defaultLocale]! };
  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title,
      description,
      url: canonical,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

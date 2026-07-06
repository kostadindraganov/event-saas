import { afterEach, expect, test, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

test("getBaseUrl чете NEXT_PUBLIC_APP_URL", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://event-review.bg");
  const { getBaseUrl } = await import("./seo");
  expect(getBaseUrl()).toBe("https://event-review.bg");
});

test("getBaseUrl fallback без env", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  const { getBaseUrl } = await import("./seo");
  expect(getBaseUrl()).toBe("http://localhost:3000");
});

test("buildLocalizedUrls: bg без префикс, en с /en", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://event-review.bg");
  const { buildLocalizedUrls } = await import("./seo");
  const urls = buildLocalizedUrls({ pathname: "/[category]", params: { category: "fotografi" } });
  expect(urls.bg).toBe("https://event-review.bg/fotografi");
  expect(urls.en).toBe("https://event-review.bg/en/fotografi");
});

test("publicMetadata: canonical за текущия locale + hreflang с x-default→bg", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://event-review.bg");
  const { publicMetadata } = await import("./seo");
  const meta = publicMetadata({
    locale: "en",
    href: { pathname: "/obiava/[slug]", params: { slug: "test-studio" } },
    title: "Test Studio",
    description: "desc",
  });
  expect(meta.alternates?.canonical).toBe("https://event-review.bg/en/obiava/test-studio");
  expect(meta.alternates?.languages).toMatchObject({
    bg: "https://event-review.bg/obiava/test-studio",
    en: "https://event-review.bg/en/obiava/test-studio",
    "x-default": "https://event-review.bg/obiava/test-studio",
  });
});

test("publicMetadata: noindex флаг слага robots.index=false", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://event-review.bg");
  const { publicMetadata } = await import("./seo");
  const meta = publicMetadata({
    locale: "bg",
    href: { pathname: "/tarsene" },
    title: "t",
    description: "d",
    noindex: true,
  });
  expect(meta.robots).toEqual({ index: false, follow: true });
});

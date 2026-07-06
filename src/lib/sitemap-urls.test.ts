import { afterEach, expect, test, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

test("localizedSitemapEntry: url = bg canonical, alternates.languages пълни", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://event-review.bg");
  const { localizedSitemapEntry } = await import("./sitemap-urls");
  const lastModified = new Date("2026-01-01T00:00:00.000Z");
  const entry = localizedSitemapEntry(
    { pathname: "/obiava/[slug]", params: { slug: "studio-x" } },
    lastModified,
  );
  expect(entry.url).toBe("https://event-review.bg/obiava/studio-x");
  expect(entry.lastModified).toBe(lastModified);
  expect(entry.alternates).toEqual({
    languages: {
      bg: "https://event-review.bg/obiava/studio-x",
      en: "https://event-review.bg/en/obiava/studio-x",
    },
  });
});

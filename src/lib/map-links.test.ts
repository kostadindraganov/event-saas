import { expect, test } from "vitest";
import { cityPinHref } from "./map-links";

test("query mode: слага city, маха page и view", () => {
  const params = new URLSearchParams("sort=priceAsc&page=3&view=map&priceMin=1000");
  const href = cityPinHref({
    mode: "query",
    pin: { cityId: "11111111-1111-1111-1111-111111111111", slug: "plovdiv" },
    categorySlug: "fotografi",
    currentParams: params,
  });
  const [path, qs] = href.split("?");
  expect(path).toBe("/fotografi");
  const out = new URLSearchParams(qs);
  expect(out.get("city")).toBe("11111111-1111-1111-1111-111111111111");
  expect(out.get("sort")).toBe("priceAsc");
  expect(out.get("priceMin")).toBe("1000");
  expect(out.has("page")).toBe(false);
  expect(out.has("view")).toBe(false);
});

test("query mode: без други params → само city", () => {
  const href = cityPinHref({
    mode: "query",
    pin: { cityId: "abc", slug: "varna" },
    categorySlug: "dj",
    currentParams: new URLSearchParams(),
  });
  expect(href).toBe("/dj?city=abc");
});

test("route mode: към geo-landing по slug, игнорира params", () => {
  const href = cityPinHref({
    mode: "route",
    pin: { cityId: "abc", slug: "varna" },
    categorySlug: "dj",
    currentParams: new URLSearchParams("view=map"),
  });
  expect(href).toBe("/dj/varna");
});

import { expect, test } from "vitest";
import { CATEGORIES, REGIONS } from "../../scripts/seed-data";

test("17 категории с уникални slug-ове", () => {
  expect(CATEGORIES).toHaveLength(17);
  expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(17);
});

test("28 области с уникални slug-ове и по един град", () => {
  expect(REGIONS).toHaveLength(28);
  expect(new Set(REGIONS.map((r) => r.slug)).size).toBe(28);
  for (const r of REGIONS) expect(r.city.slug.length).toBeGreaterThan(0);
});

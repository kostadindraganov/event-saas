import { expect, test } from "vitest";
import { ATTRIBUTE_SEED } from "../../scripts/seed-attributes";
import { CATEGORIES } from "../../scripts/seed-data";

test("всяка от 17-те категории има атрибути", () => {
  for (const c of CATEGORIES) {
    const defs = ATTRIBUTE_SEED[c.slug];
    expect(defs, `липсват атрибути за ${c.slug}`).toBeDefined();
    expect(defs!.length).toBeGreaterThanOrEqual(1);
  }
});

test("ключовете са уникални per категория; single/multi имат options", () => {
  for (const [slug, defs] of Object.entries(ATTRIBUTE_SEED)) {
    expect(new Set(defs.map((d) => d.key)).size, slug).toBe(defs.length);
    for (const d of defs) {
      if (d.type === "single" || d.type === "multi") {
        expect(d.options && d.options.length >= 2, `${slug}.${d.key} няма options`).toBe(true);
      } else {
        expect(d.options, `${slug}.${d.key} не бива да има options`).toBeUndefined();
      }
    }
  }
});

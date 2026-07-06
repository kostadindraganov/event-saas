import { expect, test } from "vitest";
import { parseSort, parsePage, parseAttrs, parseListParams, pageWindow } from "./catalog-search-params";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";

const defs: AttributeDefinitionDTO[] = [
  { id: "d1", key: "style", labelBg: "Стил", labelEn: "Style", type: "multi", options: [{ value: "a", labelBg: "А", labelEn: "A" }, { value: "b", labelBg: "Б", labelEn: "B" }], showAsFilter: true, showAsChip: true, sortOrder: 0 },
  { id: "d2", key: "hidden", labelBg: "X", labelEn: "X", type: "single", options: [{ value: "x", labelBg: "X", labelEn: "X" }], showAsFilter: false, showAsChip: false, sortOrder: 1 },
];

test("parseSort", () => {
  expect(parseSort({ sort: "priceAsc" })).toBe("priceAsc");
  expect(parseSort({ sort: "junk" })).toBe("new");
  expect(parseSort({})).toBe("new");
});

test("parsePage caps and floors", () => {
  expect(parsePage({ page: "3" })).toBe(3);
  expect(parsePage({ page: "0" })).toBe(1);
  expect(parsePage({ page: "999" })).toBe(50);
  expect(parsePage({ page: "abc" })).toBe(1);
});

test("parseAttrs only showAsFilter defs", () => {
  expect(parseAttrs({ attr_d1: "a,b", attr_d2: "x" }, defs)).toEqual([{ definitionId: "d1", values: ["a", "b"] }]);
});

test("parseListParams reads cents from URL", () => {
  const input = parseListParams({ priceMin: "5000", priceMax: "20000", city: "c1" }, "cat1", defs);
  expect(input.categoryId).toBe("cat1");
  expect(input.cityId).toBe("c1");
  expect(input.priceMinCents).toBe(5000);
  expect(input.priceMaxCents).toBe(20000);
  expect(input.perPage).toBe(24);
});

test("parseListParams override wins", () => {
  expect(parseListParams({ city: "c1" }, "cat1", defs, { cityId: "fixed" }).cityId).toBe("fixed");
});

test("pageWindow", () => {
  expect(pageWindow(1, 1)).toEqual([1]);
  expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  expect(pageWindow(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
});

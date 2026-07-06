import { expect, test } from "vitest";
import { formatEuro, parseEuroToCents } from "./money";

test("formatEuro", () => {
  expect(formatEuro(1500)).toBe("15 €");
  expect(formatEuro(123456)).toBe("1234,56 €");
  expect(formatEuro(100)).toBe("1 €");
});

test("parseEuroToCents", () => {
  expect(parseEuroToCents("15")).toBe(1500);
  expect(parseEuroToCents("1234,56")).toBe(123456);
  expect(parseEuroToCents("1234.56")).toBe(123456);
  expect(parseEuroToCents("12,5")).toBe(1250);
  expect(parseEuroToCents("")).toBeNull();
  expect(parseEuroToCents("abc")).toBeNull();
  expect(parseEuroToCents("-5")).toBeNull();
  expect(parseEuroToCents("1,234")).toBeNull(); // 3 знака след запетаята
});

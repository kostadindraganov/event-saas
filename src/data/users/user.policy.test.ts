import { expect, test } from "vitest";
import { canAdmin } from "./user.policy";

test("canAdmin: само isAdmin=true минава", () => {
  expect(canAdmin({ isAdmin: true })).toBe(true);
  expect(canAdmin({ isAdmin: false })).toBe(false);
  expect(canAdmin(null)).toBe(false);
});

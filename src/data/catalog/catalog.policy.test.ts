import { expect, test } from "vitest";
import { canCreateListing, canEditListing, canSubmitListing } from "./catalog.policy";

const owner = { id: "u1", isAdmin: false };
const other = { id: "u2", isAdmin: false };
const admin = { id: "u3", isAdmin: true };
const listing = { ownerId: "u1" };

test("create: всеки логнат (Ф1 без entitlements)", () => {
  expect(canCreateListing(owner)).toBe(true);
  expect(canCreateListing(null)).toBe(false);
});

test("edit: само собственик или админ", () => {
  expect(canEditListing(owner, listing)).toBe(true);
  expect(canEditListing(other, listing)).toBe(false);
  expect(canEditListing(admin, listing)).toBe(true);
  expect(canEditListing(null, listing)).toBe(false);
});

test("submit: собственик, само от draft/rejected", () => {
  expect(canSubmitListing(owner, { ownerId: "u1", status: "draft" })).toBe(true);
  expect(canSubmitListing(owner, { ownerId: "u1", status: "rejected" })).toBe(true);
  expect(canSubmitListing(owner, { ownerId: "u1", status: "published" })).toBe(false);
  expect(canSubmitListing(other, { ownerId: "u1", status: "draft" })).toBe(false);
});

import { expect, test } from "vitest";
import { canCancelBooking, canManageCalendar, canModerateBooking } from "./booking.policy";

const owner = { id: "u1", isAdmin: false };
const stranger = { id: "u2", isAdmin: false };
const admin = { id: "u3", isAdmin: true };
const customer = { id: "u4", isAdmin: false };

test("canManageCalendar: собственик или админ", () => {
  expect(canManageCalendar(owner, "u1")).toBe(true);
  expect(canManageCalendar(stranger, "u1")).toBe(false);
  expect(canManageCalendar(admin, "u1")).toBe(true);
  expect(canManageCalendar(null, "u1")).toBe(false);
});

test("canModerateBooking: собственик или админ", () => {
  expect(canModerateBooking(owner, "u1")).toBe(true);
  expect(canModerateBooking(stranger, "u1")).toBe(false);
  expect(canModerateBooking(admin, "u1")).toBe(true);
  expect(canModerateBooking(null, "u1")).toBe(false);
});

test("canCancelBooking: клиент отменя своя pending/confirmed", () => {
  const b = { customerId: "u4", listingOwnerId: "u1", status: "pending" as const };
  expect(canCancelBooking(customer, b)).toBe("customer");
  expect(canCancelBooking(customer, { ...b, status: "confirmed" })).toBe("customer");
});

test("canCancelBooking: вендор (собственик или админ) отменя чужда резервация", () => {
  const b = { customerId: "u4", listingOwnerId: "u1", status: "pending" as const };
  expect(canCancelBooking(owner, b)).toBe("vendor");
  expect(canCancelBooking(admin, b)).toBe("vendor");
});

test("canCancelBooking: чужд потребител, терминален статус или null user → null", () => {
  const b = { customerId: "u4", listingOwnerId: "u1", status: "pending" as const };
  expect(canCancelBooking(stranger, b)).toBe(null);
  expect(canCancelBooking(customer, { ...b, status: "declined" })).toBe(null);
  expect(canCancelBooking(owner, { ...b, status: "cancelled_by_customer" })).toBe(null);
  expect(canCancelBooking(null, b)).toBe(null);
});

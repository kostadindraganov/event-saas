import { expect, test } from "vitest";
import { BookingRequestSchema, ServiceTypeCreateSchema } from "./booking.dto";

const listingId = "11111111-1111-4111-8111-111111111111";
const serviceTypeId = "22222222-2222-4222-8222-222222222222";

test("ServiceTypeCreateSchema: hourly изисква durationMinutes > 0", () => {
  expect(ServiceTypeCreateSchema.safeParse({ listingId, kind: "hourly", name: "Фотосесия" }).success).toBe(false);
  expect(
    ServiceTypeCreateSchema.safeParse({ listingId, kind: "hourly", name: "Фотосесия", durationMinutes: 60 }).success,
  ).toBe(true);
});

test("ServiceTypeCreateSchema: full_day отхвърля durationMinutes", () => {
  expect(
    ServiceTypeCreateSchema.safeParse({ listingId, kind: "full_day", name: "Сватба", durationMinutes: 60 }).success,
  ).toBe(false);
  expect(ServiceTypeCreateSchema.safeParse({ listingId, kind: "full_day", name: "Сватба" }).success).toBe(true);
});

test("BookingRequestSchema: валиден parse", () => {
  const parsed = BookingRequestSchema.parse({ listingId, serviceTypeId, eventDate: "2026-08-10", phone: "0888123456" });
  expect(parsed.eventDate).toBe("2026-08-10");
});

import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { CalendarDAL } from "./calendar.dal";
import type { SessionUser } from "@/data/users/require-user";

let vendorId: string, customerId: string;
let vendor: SessionUser;
let listingId: string, serviceTypeId: string;

beforeAll(async () => {
  const v = await createTestUser();
  vendorId = v.id;
  vendor = { id: v.id, email: v.email, name: "Вендор", isAdmin: false };
  await createTestSubscription(vendorId, { plan: "premium", status: "active" });
  const c = await createTestUser();
  customerId = c.id;
  await testDb.update(schema.user).set({ name: "Клиент Тест" }).where(eq(schema.user.id, customerId));

  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  const cities = await testDb.select().from(schema.city).limit(1);
  const l = await ListingDAL.for(vendor).createDraft({ title: "Обява Фото", categoryId: cat!.id, cityId: cities[0]!.id });
  listingId = l.id;
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, l.id));
  const [st] = await testDb.insert(schema.bookingServiceType).values({
    listingId, kind: "full_day", name: "Сватбен пакет", durationMinutes: null, priceFromCents: 100000, isActive: true,
  }).returning();
  serviceTypeId = st!.id;

  const mkBooking = async (status: string, eventDate: string, isFullDay: boolean, startTime: string | null, endTime: string | null) => {
    await testDb.insert(schema.booking).values({
      listingId, serviceTypeId, customerId, status: status as never,
      isFullDay, eventDate, startTime, endTime, phone: "0888", message: null,
    });
  };
  await mkBooking("confirmed", "2026-09-01", true, null, null);
  await mkBooking("confirmed", "2026-09-05", false, "10:00", "12:00");
  await mkBooking("pending", "2026-09-10", true, null, null);        // excluded
  await mkBooking("cancelled_by_customer", "2026-09-11", true, null, null); // excluded
});

afterAll(async () => {
  await testDb.delete(schema.booking).where(eq(schema.booking.listingId, listingId));
  await testDb.delete(schema.bookingServiceType).where(eq(schema.bookingServiceType.listingId, listingId));
  await cleanupTestUser(vendorId);
  await cleanupTestUser(customerId);
});

test("regenerate → url, повторно = нов токен (rotate)", async () => {
  const first = await CalendarDAL.for(vendor).regenerateIcalToken();
  expect(first.url).toMatch(/\/api\/calendar\/vendor\/.+\.ics$/);
  const second = await CalendarDAL.for(vendor).regenerateIcalToken();
  expect(second.url).not.toBe(first.url); // ротира токена
  const cur = await CalendarDAL.for(vendor).getIcalUrl();
  expect(cur.url).toBe(second.url);
});

test("confirmedBookingsForIcalToken: само confirmed на вендора", async () => {
  const { url } = await CalendarDAL.for(vendor).regenerateIcalToken();
  const token = url.split("/").pop()!.replace(/\.ics$/, "");
  const rows = await CalendarDAL.confirmedBookingsForIcalToken(token);
  expect(rows).not.toBeNull();
  expect(rows!.map((r) => r.eventDate).sort()).toEqual(["2026-09-01", "2026-09-05"]);
  expect(rows!.every((r) => r.customerName === "Клиент Тест")).toBe(true);
  const hourly = rows!.find((r) => r.eventDate === "2026-09-05")!;
  expect(hourly.startTime).toBe("10:00");
  expect(hourly.endTime).toBe("12:00");
  expect(hourly.isFullDay).toBe(false);
  expect(rows!.find((r) => r.eventDate === "2026-09-01")!.startTime).toBeNull();
});

test("revoke → getIcalUrl null, token вече не резолвва", async () => {
  const { url } = await CalendarDAL.for(vendor).regenerateIcalToken();
  const token = url.split("/").pop()!.replace(/\.ics$/, "");
  await CalendarDAL.for(vendor).revokeIcalToken();
  expect((await CalendarDAL.for(vendor).getIcalUrl()).url).toBeNull();
  expect(await CalendarDAL.confirmedBookingsForIcalToken(token)).toBeNull();
});

test("непознат токен → null (→ 404 в route-а)", async () => {
  expect(await CalendarDAL.confirmedBookingsForIcalToken("no-such-token")).toBeNull();
});

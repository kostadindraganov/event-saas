import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { CalendarDAL } from "@/data/booking/calendar.dal";
import type { SessionUser } from "@/data/users/require-user";
import { GET } from "./route";

let vendorId: string, customerId: string, listingId: string;
let token: string;

beforeAll(async () => {
  const v = await createTestUser();
  vendorId = v.id;
  const vendor: SessionUser = { id: v.id, email: v.email, name: "Вендор", isAdmin: false };
  await createTestSubscription(vendorId, { plan: "premium", status: "active" });
  const c = await createTestUser();
  customerId = c.id;
  await testDb.update(schema.user).set({ name: "Клиент" }).where(eq(schema.user.id, customerId));
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  const [city] = await testDb.select().from(schema.city).limit(1);
  const l = await ListingDAL.for(vendor).createDraft({ title: "Обява", categoryId: cat!.id, cityId: city!.id });
  listingId = l.id;
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, l.id));
  const [st] = await testDb.insert(schema.bookingServiceType).values({
    listingId, kind: "full_day", name: "Пакет", durationMinutes: null, priceFromCents: 1000, isActive: true,
  }).returning();
  await testDb.insert(schema.booking).values({
    listingId, serviceTypeId: st!.id, customerId, status: "confirmed",
    isFullDay: true, eventDate: "2026-10-10", startTime: null, endTime: null, phone: "0888", message: null,
  });
  token = (await CalendarDAL.for(vendor).regenerateIcalToken()).url.split("/").pop()!.replace(/\.ics$/, "");
});

afterAll(async () => {
  await testDb.delete(schema.booking).where(eq(schema.booking.listingId, listingId));
  await testDb.delete(schema.bookingServiceType).where(eq(schema.bookingServiceType.listingId, listingId));
  await cleanupTestUser(vendorId);
  await cleanupTestUser(customerId);
});

test("валиден токен (с .ics) → 200 text/calendar с VEVENT, без телефон", async () => {
  const res = await GET(new Request("http://x/"), { params: Promise.resolve({ token: `${token}.ics` }) });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:Зает — Клиент (Пакет)");
  expect(body).toContain("DTSTART;VALUE=DATE:20261010");
  expect(body).not.toContain("0888"); // телефонът никога не изтича във feed-а
});

test("непознат токен → 404", async () => {
  const res = await GET(new Request("http://x/"), { params: Promise.resolve({ token: "nope.ics" }) });
  expect(res.status).toBe(404);
});

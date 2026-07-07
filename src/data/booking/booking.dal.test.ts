import { afterEach, expect, test } from "vitest";
import { BookingDAL } from "./booking.dal";
import {
  testDb, createTestUser, cleanupTestUser, createTestListing, getTestCategoryId, getTestCityId,
  createTestServiceType, createTestAvailability,
} from "@/test/db-helpers";
import { weekdayOf } from "./slots";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function vendorWithListing(status: "published" | "draft" = "published"): Promise<{ vendor: SessionUser; listingId: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(u.id, { status, categoryId, cityId });
  return { vendor: { id: u.id, email: u.email, name: "Доставчик", isAdmin: false }, listingId: l.id };
}

async function newCustomer(): Promise<SessionUser> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  return { id: u.id, email: u.email, name: "Клиент", isAdmin: false };
}

test("request(): непубликувана обява → NOT_FOUND NOT_PUBLISHED", async () => {
  const { listingId } = await vendorWithListing("draft");
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_PUBLISHED" });
});

test("request(): собственик резервира собствената обява → FORBIDDEN SELF_BOOKING", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  await expect(BookingDAL.for(vendor).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "FORBIDDEN", message: "SELF_BOOKING" });
});

test("request(): минала дата → BAD_REQUEST PAST_DATE", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2020-01-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PAST_DATE" });
});

test("request(): часова услуга без startTime → BAD_REQUEST INVALID_START_TIME", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  const customer = await newCustomer();
  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_START_TIME" });
});

test("request(): happy path — BookingDTO с изчислен endTime, вижда се в listMine()", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 90 });
  // rule стартира точно в 10:00, за да се подравни slot-стъпката (90мин) с искания старт
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-06-01"), startTime: "10:00", endTime: "12:00" });
  const customer = await newCustomer();

  const dto = await BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", startTime: "10:00", phone: "0888123123", message: "Здравейте",
  });

  expect(dto.status).toBe("pending");
  expect(dto.isFullDay).toBe(false);
  expect(dto.startTime).toBe("10:00");
  expect(dto.endTime).toBe("11:30"); // 10:00 + 90мин, изчислено през slots.addMinutes
  expect(dto.customerId).toBe(customer.id);

  const mine = await BookingDAL.for(customer).listMine();
  expect(mine.some((b) => b.id === dto.id)).toBe(true);
});

test("request(): часова услуга без configured availabilityRule → CONFLICT SLOT_UNAVAILABLE", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  const customer = await newCustomer();

  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", startTime: "10:00", phone: "0888123123",
  })).rejects.toMatchObject({ code: "CONFLICT", message: "SLOT_UNAVAILABLE" });
});

test("request(): валиден слот в рамките на availabilityRule → успех", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-06-02"), startTime: "09:00", endTime: "11:00" });
  const customer = await newCustomer();

  const dto = await BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-02", startTime: "10:00", phone: "0888123123",
  });
  expect(dto.startTime).toBe("10:00");
  expect(dto.endTime).toBe("11:00");
});

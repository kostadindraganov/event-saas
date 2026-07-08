import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  cleanupTestUser, createTestAvailability, createTestBooking, createTestListing,
  createTestReview, createTestServiceType, createTestUser, getTestCategoryId, getTestCityId, testDb,
} from "./db-helpers";
import * as schema from "@/db/schema";

let ownerId: string | undefined;
let customerId: string | undefined;

afterEach(async () => {
  if (ownerId) await cleanupTestUser(ownerId);
  if (customerId) await cleanupTestUser(customerId);
  ownerId = undefined;
  customerId = undefined;
});

test("createTestServiceType / createTestAvailability / createTestBooking инсъртват и връщат реда", async () => {
  const owner = await createTestUser();
  ownerId = owner.id;
  const customer = await createTestUser();
  customerId = customer.id;
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listing = await createTestListing(ownerId, { status: "published", categoryId, cityId });

  const serviceType = await createTestServiceType(listing.id, { kind: "hourly", durationMinutes: 90 });
  expect(serviceType.listingId).toBe(listing.id);
  expect(serviceType.kind).toBe("hourly");
  expect(serviceType.durationMinutes).toBe(90);

  const availability = await createTestAvailability(listing.id, { weekday: 2, startTime: "09:00:00", endTime: "17:00:00" });
  expect(availability.listingId).toBe(listing.id);
  expect(availability.weekday).toBe(2);

  const booking = await createTestBooking(listing.id, serviceType.id, customerId, {
    isFullDay: false, eventDate: "2026-08-10", startTime: "10:00:00", endTime: "11:30:00", phone: "0888123456",
  });
  expect(booking.listingId).toBe(listing.id);
  expect(booking.serviceTypeId).toBe(serviceType.id);
  expect(booking.customerId).toBe(customerId);
  expect(booking.status).toBe("pending");
});

test("cleanupTestUser трие booking (по listingId и по customerId) преди listing/user (no-cascade FK)", async () => {
  const owner = await createTestUser();
  ownerId = owner.id;
  const customer = await createTestUser();
  customerId = customer.id;
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listing = await createTestListing(ownerId, { status: "published", categoryId, cityId });
  const serviceType = await createTestServiceType(listing.id, { kind: "full_day" });
  const booking = await createTestBooking(listing.id, serviceType.id, customerId, {
    isFullDay: true, eventDate: "2026-09-01", phone: "0888000000",
  });

  await cleanupTestUser(ownerId); // трие booking-а (no-cascade) преди да трие listing-а; иначе FK грешка
  const [gone] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, booking.id));
  expect(gone).toBeUndefined();

  await cleanupTestUser(customerId);
  const [userGone] = await testDb.select().from(schema.user).where(eq(schema.user.id, customerId));
  expect(userGone).toBeUndefined();
});

test("createTestReview + cleanupTestUser: ревюто се вкарва и cleanup-ът го трие без FK грешка", async () => {
  const owner = await createTestUser();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(owner.id, { status: "published", categoryId, cityId });
  const customer = await createTestUser();
  const st = await createTestServiceType(l.id, { kind: "full_day" });
  const b = await createTestBooking(l.id, st.id, customer.id, {
    status: "completed", isFullDay: true, eventDate: "2026-01-01", phone: "0888000000",
  });
  const r = await createTestReview(b.id, l.id, customer.id);

  const [before] = await testDb.select().from(schema.review).where(eq(schema.review.id, r.id));
  expect(before).toBeDefined();
  expect(Number(before?.ratingOverall)).toBeCloseTo(5, 2); // default overrides → всички 5-ци

  await cleanupTestUser(customer.id);
  await cleanupTestUser(owner.id);

  const [after] = await testDb.select().from(schema.review).where(eq(schema.review.id, r.id));
  expect(after).toBeUndefined();
});

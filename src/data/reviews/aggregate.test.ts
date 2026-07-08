import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, cleanupTestUser, createTestListing, createTestServiceType, createTestBooking,
  createTestReview, getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { recomputeListingRating } from "./aggregate";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function newListing(): Promise<string> {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(owner.id, { status: "published", categoryId, cityId });
  return l.id;
}

async function completedBooking(listingId: string, customerId: string): Promise<string> {
  const st = await createTestServiceType(listingId, { kind: "full_day" });
  const b = await createTestBooking(listingId, st.id, customerId, {
    status: "completed", isFullDay: true, eventDate: "2026-01-01", phone: "0888000000",
  });
  return b.id;
}

test("recomputeListingRating: без ревюта → ratingAvg=null, reviewCount=0", async () => {
  const listingId = await newListing();
  await testDb.transaction((tx) => recomputeListingRating(tx, listingId));
  const [row] = await testDb.select({ ratingAvg: schema.listing.ratingAvg, reviewCount: schema.listing.reviewCount })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(row?.reviewCount).toBe(0);
  expect(row?.ratingAvg).toBeNull();
});

test("recomputeListingRating: брои и осреднява само visible ревюта, игнорира hidden_by_admin", async () => {
  const listingId = await newListing();
  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  const b1 = await completedBooking(listingId, customer.id);
  const b2 = await completedBooking(listingId, customer.id);
  await createTestReview(b1, listingId, customer.id, {
    ratingQuality: 5, ratingCommunication: 5, ratingProfessionalism: 5, ratingValue: 5, ratingFlexibility: 5,
  });
  await createTestReview(b2, listingId, customer.id, {
    ratingQuality: 3, ratingCommunication: 3, ratingProfessionalism: 3, ratingValue: 3, ratingFlexibility: 3,
    status: "hidden_by_admin",
  });

  await testDb.transaction((tx) => recomputeListingRating(tx, listingId));
  const [row] = await testDb.select({ ratingAvg: schema.listing.ratingAvg, reviewCount: schema.listing.reviewCount })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(row?.reviewCount).toBe(1);
  expect(Number(row?.ratingAvg)).toBeCloseTo(5, 2);
});

test("recomputeListingRating: скриване на ревю (status промяна) го маха от агрегата при следващ recompute", async () => {
  const listingId = await newListing();
  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  const b1 = await completedBooking(listingId, customer.id);
  const b2 = await completedBooking(listingId, customer.id);
  const r1 = await createTestReview(b1, listingId, customer.id, {
    ratingQuality: 5, ratingCommunication: 5, ratingProfessionalism: 5, ratingValue: 5, ratingFlexibility: 5,
  });
  await createTestReview(b2, listingId, customer.id, {
    ratingQuality: 1, ratingCommunication: 1, ratingProfessionalism: 1, ratingValue: 1, ratingFlexibility: 1,
  });

  await testDb.transaction((tx) => recomputeListingRating(tx, listingId));
  const [before] = await testDb.select({ reviewCount: schema.listing.reviewCount })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(before?.reviewCount).toBe(2);

  // симулира admin hide извън ReviewDAL (admin.dal.ts resolveReport() е друга секция) — само status промяна
  await testDb.update(schema.review).set({ status: "hidden_by_admin" }).where(eq(schema.review.id, r1.id));
  await testDb.transaction((tx) => recomputeListingRating(tx, listingId));

  const [after] = await testDb.select({ ratingAvg: schema.listing.ratingAvg, reviewCount: schema.listing.reviewCount })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(after?.reviewCount).toBe(1);
  expect(Number(after?.ratingAvg)).toBeCloseTo(1, 2);
});

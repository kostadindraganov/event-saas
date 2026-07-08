import { afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, cleanupTestUser, createTestListing, createTestServiceType, createTestBooking,
  createTestReview, getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { ReviewDAL } from "./review.dal";

// revalidateTag извън заявка/render хвърля "static generation store missing" — стъбваме, конвенция
// от billing.dal.test.ts:12 / admin.test.ts:18.
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

function asSessionUser(u: { id: string; email: string }, opts?: { isAdmin?: boolean }): SessionUser {
  return { id: u.id, email: u.email, name: "Тест", isAdmin: opts?.isAdmin ?? false };
}

async function newOwner(): Promise<{ owner: { id: string; email: string }; listingId: string }> {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(owner.id, { status: "published", categoryId, cityId });
  return { owner, listingId: l.id };
}

async function newCustomer() {
  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  return customer;
}

async function bookingFor(
  listingId: string, customerId: string,
  opts?: { status?: "pending" | "confirmed" | "completed"; eventDate?: string },
): Promise<string> {
  const st = await createTestServiceType(listingId, { kind: "full_day" });
  const b = await createTestBooking(listingId, st.id, customerId, {
    status: opts?.status ?? "completed", isFullDay: true,
    eventDate: opts?.eventDate ?? "2026-01-01", phone: "0888000000",
  });
  return b.id;
}

function reviewInput(bookingId: string) {
  return {
    bookingId,
    ratingQuality: 5, ratingCommunication: 4, ratingProfessionalism: 5, ratingValue: 4, ratingFlexibility: 5,
    title: "Страхотно преживяване",
    body: "Всичко мина безупречно, препоръчвам горещо на всички бъдещи младоженци.",
    wouldRecommend: true,
  };
}

test("create(): успешно ревю от автора на completed резервация → avg overall, 48ч editableUntil, агрегат обновен", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);

  const before = Date.now();
  const result = await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));
  expect(result.id).toBeTruthy();
  expect(result.listingSlug).toBeTruthy();

  const [row] = await testDb.select().from(schema.review).where(eq(schema.review.id, result.id));
  expect(row?.authorId).toBe(customer.id);
  expect(row?.listingId).toBe(listingId);
  expect(Number(row?.ratingOverall)).toBeCloseTo(4.6, 2); // (5+4+5+4+5)/5
  expect(row?.editableUntil.getTime()).toBeGreaterThanOrEqual(before + 48 * 60 * 60 * 1000);

  const [l] = await testDb.select({ reviewCount: schema.listing.reviewCount, ratingAvg: schema.listing.ratingAvg })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(l?.reviewCount).toBe(1);
  expect(Number(l?.ratingAvg)).toBeCloseTo(4.6, 2);
});

test("create(): чужда резервация (различен customer) → NOT_FOUND", async () => {
  const { listingId } = await newOwner();
  const realCustomer = await newCustomer();
  const stranger = await newCustomer();
  const bookingId = await bookingFor(listingId, realCustomer.id);
  await expect(ReviewDAL.for(asSessionUser(stranger)).create(reviewInput(bookingId)))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("create(): несъществуваща резервация → NOT_FOUND", async () => {
  const customer = await newCustomer();
  await expect(
    ReviewDAL.for(asSessionUser(customer)).create(reviewInput("00000000-0000-0000-0000-000000000000")),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("create(): резервация не е completed → CONFLICT NOT_COMPLETED", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id, { status: "confirmed" });
  await expect(ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId)))
    .rejects.toMatchObject({ code: "CONFLICT", message: "NOT_COMPLETED" });
});

test("create(): второ ревю за същата резервация → CONFLICT ALREADY_REVIEWED", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));
  await expect(ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId)))
    .rejects.toMatchObject({ code: "CONFLICT", message: "ALREADY_REVIEWED" });
});

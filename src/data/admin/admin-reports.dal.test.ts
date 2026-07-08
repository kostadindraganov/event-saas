import { afterEach, expect, test, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { AdminDAL } from "./admin.dal";
import {
  createTestUser, cleanupTestUser, createTestListing, createTestServiceType, createTestBooking,
  getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";

// resolveReport() calls revalidateTag directly (interfaces.md §7 locks its return type to
// Promise<void>, so unlike AdminDAL.approve/reject/remove — which return {slug,status} for the
// ROUTER to revalidate — this method revalidates itself). No-op mock, mirrors billing.dal.test.ts.
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function insertTestReview(opts: { listingId: string; authorId: string; bookingId: string }) {
  const [row] = await testDb.insert(schema.review).values({
    bookingId: opts.bookingId,
    listingId: opts.listingId,
    authorId: opts.authorId,
    ratingQuality: 5, ratingCommunication: 5, ratingProfessionalism: 5, ratingValue: 5, ratingFlexibility: 5,
    ratingOverall: "5.00",
    title: "Страхотно преживяване",
    body: "Много добро обслужване, препоръчвам.",
    wouldRecommend: true,
    eventDate: "2099-01-01",
    editableUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
    status: "visible",
  }).returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

test("listReports: open само; JOIN reporter email; targetExcerpt/targetListingSlug=null ако target е изтрит", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingRow.id, reporterId: reporter.id, reason: "Нередност",
  }).returning();

  const beforeDelete = await AdminDAL.listReports();
  const row = beforeDelete.find((r) => r.id === rpt!.id);
  expect(row?.reporterEmail).toBe(reporter.email);
  expect(row?.targetExcerpt).toBe(listingRow.title);
  expect(row?.targetListingSlug).toBe(listingRow.slug);

  await testDb.delete(schema.listing).where(eq(schema.listing.id, listingRow.id));
  const afterDelete = await AdminDAL.listReports();
  const rowAfter = afterDelete.find((r) => r.id === rpt!.id);
  expect(rowAfter?.targetExcerpt).toBeNull();
  expect(rowAfter?.targetListingSlug).toBeNull();

  await testDb.update(schema.report).set({ status: "resolved" }).where(eq(schema.report.id, rpt!.id));
  const afterResolve = await AdminDAL.listReports();
  expect(afterResolve.some((r) => r.id === rpt!.id)).toBe(false); // open само

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
});

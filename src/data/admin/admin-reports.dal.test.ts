import { afterEach, expect, test, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { AdminDAL } from "./admin.dal";
import {
  createTestUser, cleanupTestUser, createTestListing, createTestServiceType, createTestBooking,
  createTestReview, getTestCategoryId, getTestCityId, testDb,
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

test("resolveReport: action=dismiss → report.status=resolved, target без промяна", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingRow.id, reporterId: reporter.id, reason: "Съмнение",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "dismiss", resolution: "Проверено, няма нарушение" });

  const [listingAfter] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingRow.id));
  expect(listingAfter?.status).toBe("published");

  const [reportAfter] = await testDb.select().from(schema.report).where(eq(schema.report.id, rpt!.id));
  expect(reportAfter?.status).toBe("resolved");
  expect(reportAfter?.resolution).toBe("Проверено, няма нарушение");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
});

test("resolveReport: review target action=hide → review.status=hidden_by_admin, recompute вади го от listing агрегатите", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  const st = await createTestServiceType(listingRow.id, { kind: "full_day" });
  const booking = await createTestBooking(listingRow.id, st.id, customer.id, {
    status: "completed", isFullDay: true, eventDate: "2099-01-01", phone: "0888123123",
  });
  const rev = await insertTestReview({ listingId: listingRow.id, authorId: customer.id, bookingId: booking.id });

  // симулира вече кеширан агрегат (сякаш това ревю вече е било преизчислено веднъж) — resolveReport
  // трябва да го извади при hide
  await testDb.update(schema.listing).set({ reviewCount: 1, ratingAvg: "5.00" }).where(eq(schema.listing.id, listingRow.id));

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "review", targetId: rev.id, reporterId: reporter.id, reason: "Фалшиво ревю",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "hide" });

  const [revRow] = await testDb.select().from(schema.review).where(eq(schema.review.id, rev.id));
  expect(revRow?.status).toBe("hidden_by_admin");

  const [listingAfter] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingRow.id));
  expect(listingAfter?.reviewCount).toBe(0);
  expect(listingAfter?.ratingAvg).toBeNull();

  const [reportAfter] = await testDb.select().from(schema.report).where(eq(schema.report.id, rpt!.id));
  expect(reportAfter?.status).toBe("resolved");

  // review references booking/listing/user без cascade — трий преди cleanupTestUser
  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
  await testDb.delete(schema.review).where(eq(schema.review.id, rev.id));
});

test("resolveReport: question target action=remove → question.status=removed", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const asker = await createTestUser();
  cleanupIds.push(asker.id);
  const [q] = await testDb.insert(schema.question).values({
    listingId: listingRow.id, authorId: asker.id, body: "Работите ли на празници?",
  }).returning();

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "question", targetId: q!.id, reporterId: reporter.id, reason: "Спам въпрос",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "remove" });

  const [qAfter] = await testDb.select().from(schema.question).where(eq(schema.question.id, q!.id));
  expect(qAfter?.status).toBe("removed");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
  // question каскадира от listing (owner cleanup по-долу) — не е нужно явно изтриване тук
});

test("resolveReport: listing target action=hide → status=hidden (CAS от published); action=remove → status=removed", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingA = await createTestListing(owner.id, { status: "published", categoryId, cityId });
  const listingB = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rptA] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingA.id, reporterId: reporter.id, reason: "А",
  }).returning();
  const [rptB] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingB.id, reporterId: reporter.id, reason: "Б",
  }).returning();

  await AdminDAL.resolveReport({ id: rptA!.id, action: "hide" });
  const [rowA] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingA.id));
  expect(rowA?.status).toBe("hidden");

  await AdminDAL.resolveReport({ id: rptB!.id, action: "remove" });
  const [rowB] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingB.id));
  expect(rowB?.status).toBe("removed");

  await testDb.delete(schema.report).where(inArray(schema.report.id, [rptA!.id, rptB!.id]));
});

test("resolveReport: вече resolved report → CONFLICT ALREADY_RESOLVED", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingRow.id, reporterId: reporter.id, reason: "Дубликат тест",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "dismiss" });
  await expect(AdminDAL.resolveReport({ id: rpt!.id, action: "dismiss" }))
    .rejects.toMatchObject({ code: "CONFLICT", message: "ALREADY_RESOLVED" });

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
});

test("resolveReport: listing target action=remove от hidden → status=removed (CAS покрива hidden→removed, не само published→removed)", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "hidden", categoryId, cityId });

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingRow.id, reporterId: reporter.id, reason: "Втори репорт върху скрита обява",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "remove" });

  const [listingAfter] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingRow.id));
  expect(listingAfter?.status).toBe("removed");

  const [reportAfter] = await testDb.select().from(schema.report).where(eq(schema.report.id, rpt!.id));
  expect(reportAfter?.status).toBe("resolved");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
});

test("resolveReport: review target action=remove → review.status=removed, recompute вади го от агрегатите", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  const st = await createTestServiceType(listingRow.id, { kind: "full_day" });
  const booking = await createTestBooking(listingRow.id, st.id, customer.id, {
    status: "completed", isFullDay: true, eventDate: "2099-01-01", phone: "0888123124",
  });
  const rev = await createTestReview(booking.id, listingRow.id, customer.id);

  await testDb.update(schema.listing).set({ reviewCount: 1, ratingAvg: "5.00" }).where(eq(schema.listing.id, listingRow.id));

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "review", targetId: rev.id, reporterId: reporter.id, reason: "Обидно съдържание",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "remove" });

  const [revRow] = await testDb.select().from(schema.review).where(eq(schema.review.id, rev.id));
  expect(revRow?.status).toBe("removed");

  const [listingAfter] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingRow.id));
  expect(listingAfter?.reviewCount).toBe(0);
  expect(listingAfter?.ratingAvg).toBeNull();

  const [reportAfter] = await testDb.select().from(schema.report).where(eq(schema.report.id, rpt!.id));
  expect(reportAfter?.status).toBe("resolved");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
  await testDb.delete(schema.review).where(eq(schema.review.id, rev.id));
});

test("resolveReport: question target action=hide → question.status=hidden_by_admin, без агрегат", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listingRow = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const asker = await createTestUser();
  cleanupIds.push(asker.id);
  const [q] = await testDb.insert(schema.question).values({
    listingId: listingRow.id, authorId: asker.id, body: "Има ли паркинг наблизо?",
  }).returning();

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "question", targetId: q!.id, reporterId: reporter.id, reason: "Неуместен въпрос",
  }).returning();

  await AdminDAL.resolveReport({ id: rpt!.id, action: "hide" });

  const [qAfter] = await testDb.select().from(schema.question).where(eq(schema.question.id, q!.id));
  expect(qAfter?.status).toBe("hidden_by_admin");

  const [reportAfter] = await testDb.select().from(schema.report).where(eq(schema.report.id, rpt!.id));
  expect(reportAfter?.status).toBe("resolved");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
});

test("resolveReport: CAS-miss (target вече неактуален) → CONFLICT TARGET_NOT_ACTIONABLE, report остава open", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  // hide изисква status=published; обявата вече е removed → CAS не намира ред
  const listingRow = await createTestListing(owner.id, { status: "removed", categoryId, cityId });

  const reporter = await createTestUser();
  cleanupIds.push(reporter.id);
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: listingRow.id, reporterId: reporter.id, reason: "Закъснял репорт",
  }).returning();

  await expect(AdminDAL.resolveReport({ id: rpt!.id, action: "hide" }))
    .rejects.toMatchObject({ code: "CONFLICT", message: "TARGET_NOT_ACTIONABLE" });

  const [listingAfter] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingRow.id));
  expect(listingAfter?.status).toBe("removed");

  const [reportAfter] = await testDb.select().from(schema.report).where(eq(schema.report.id, rpt!.id));
  expect(reportAfter?.status).toBe("open");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
});

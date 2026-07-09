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

test("edit(): авторът в 48ч прозореца редактира оценки+текст, ratingOverall се преизчислява, агрегат се обновява", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const created = await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));

  const result = await ReviewDAL.for(asSessionUser(customer)).edit({
    id: created.id,
    ratingQuality: 2, ratingCommunication: 2, ratingProfessionalism: 2, ratingValue: 2, ratingFlexibility: 2,
    title: "Редактирано мнение", body: "Промених си мнението след размисъл за детайлите на събитието.",
    wouldRecommend: false,
  });
  expect(result.listingSlug).toBeTruthy();

  const [row] = await testDb.select().from(schema.review).where(eq(schema.review.id, created.id));
  expect(Number(row?.ratingOverall)).toBeCloseTo(2, 2);
  expect(row?.title).toBe("Редактирано мнение");

  const [l] = await testDb.select({ ratingAvg: schema.listing.ratingAvg })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(Number(l?.ratingAvg)).toBeCloseTo(2, 2);
});

test("edit(): извън 48ч прозореца, автор без admin права → FORBIDDEN EDIT_WINDOW_CLOSED", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const r = await createTestReview(bookingId, listingId, customer.id, { editableUntil: past });

  await expect(ReviewDAL.for(asSessionUser(customer)).edit({
    id: r.id,
    ratingQuality: 3, ratingCommunication: 3, ratingProfessionalism: 3, ratingValue: 3, ratingFlexibility: 3,
    title: "Опит за редакция", body: "Този опит трябва да бъде отхвърлен от guard-а за прозореца.",
    wouldRecommend: true,
  })).rejects.toMatchObject({ code: "FORBIDDEN", message: "EDIT_WINDOW_CLOSED" });
});

test("edit(): admin редактира чуждо ревю дори извън 48ч прозореца (модерация)", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const admin = await createTestUser({ isAdmin: true });
  cleanupIds.push(admin.id);
  const bookingId = await bookingFor(listingId, customer.id);
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const r = await createTestReview(bookingId, listingId, customer.id, { editableUntil: past });

  const result = await ReviewDAL.for(asSessionUser(admin, { isAdmin: true })).edit({
    id: r.id,
    ratingQuality: 1, ratingCommunication: 1, ratingProfessionalism: 1, ratingValue: 1, ratingFlexibility: 1,
    title: "Админ модерация", body: "Админът коригира текста след сигнал за неприлично съдържание.",
    wouldRecommend: false,
  });
  expect(result.listingSlug).toBeTruthy();
  const [row] = await testDb.select({ title: schema.review.title }).from(schema.review).where(eq(schema.review.id, r.id));
  expect(row?.title).toBe("Админ модерация");
});

test("edit(): чужд потребител (не автор, не admin) → NOT_FOUND", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const stranger = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const r = await createTestReview(bookingId, listingId, customer.id);

  await expect(ReviewDAL.for(asSessionUser(stranger)).edit({
    id: r.id,
    ratingQuality: 1, ratingCommunication: 1, ratingProfessionalism: 1, ratingValue: 1, ratingFlexibility: 1,
    title: "Хак опит", body: "Този опит идва от чужд акаунт и трябва да бъде отхвърлен от guard-а.",
    wouldRecommend: false,
  })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("edit(): несъществуващо ревю → NOT_FOUND", async () => {
  const customer = await newCustomer();
  await expect(ReviewDAL.for(asSessionUser(customer)).edit({
    id: "00000000-0000-0000-0000-000000000000",
    ratingQuality: 1, ratingCommunication: 1, ratingProfessionalism: 1, ratingValue: 1, ratingFlexibility: 1,
    title: "Няма такова", body: "Тестов текст с достатъчна дължина за да мине zod валидацията.",
    wouldRecommend: false,
  })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("reply(): собственикът на обявата отговаря публично, БЕЗ промяна на агрегата", async () => {
  const { owner, listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const created = await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));
  const [before] = await testDb.select({ reviewCount: schema.listing.reviewCount, ratingAvg: schema.listing.ratingAvg })
    .from(schema.listing).where(eq(schema.listing.id, listingId));

  const result = await ReviewDAL.for(asSessionUser(owner)).reply({
    reviewId: created.id, text: "Благодарим за прекрасния отзив!",
  });
  expect(result.listingSlug).toBeTruthy();

  const [row] = await testDb.select({ replyText: schema.review.replyText, replyUpdatedAt: schema.review.replyUpdatedAt })
    .from(schema.review).where(eq(schema.review.id, created.id));
  expect(row?.replyText).toBe("Благодарим за прекрасния отзив!");
  expect(row?.replyUpdatedAt).toBeInstanceOf(Date);

  const [after] = await testDb.select({ reviewCount: schema.listing.reviewCount, ratingAvg: schema.listing.ratingAvg })
    .from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(after?.reviewCount).toBe(before?.reviewCount);
  expect(after?.ratingAvg).toBe(before?.ratingAvg);
});

test("reply(): чужд потребител (не owner на обявата, не admin) → NOT_FOUND", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const stranger = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const created = await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));

  await expect(
    ReviewDAL.for(asSessionUser(stranger)).reply({ reviewId: created.id, text: "Не съм собственикът." }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("reply(): admin може да отговори вместо собственика", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const admin = await createTestUser({ isAdmin: true });
  cleanupIds.push(admin.id);
  const bookingId = await bookingFor(listingId, customer.id);
  const created = await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));

  const result = await ReviewDAL.for(asSessionUser(admin, { isAdmin: true })).reply({
    reviewId: created.id, text: "Отговор от модератор.",
  });
  expect(result.listingSlug).toBeTruthy();
});

test("reply(): несъществуващо ревю → NOT_FOUND", async () => {
  const owner = await newCustomer();
  await expect(
    ReviewDAL.for(asSessionUser(owner)).reply({ reviewId: "00000000-0000-0000-0000-000000000000", text: "Тест" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("listByListing(): връща само visible ревюта с images, подредени по createdAt desc", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const b1 = await bookingFor(listingId, customer.id);
  const b2 = await bookingFor(listingId, customer.id);
  const hiddenBookingId = await bookingFor(listingId, customer.id);

  await createTestReview(b1, listingId, customer.id, {
    title: "По-старо", createdAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  const newer = await createTestReview(b2, listingId, customer.id, { title: "По-ново" });
  await testDb.insert(schema.reviewImage).values({ reviewId: newer.id, cfImageId: "cf-test-image-1", alt: "Декорация на залата" });
  await createTestReview(hiddenBookingId, listingId, customer.id, { title: "Скрито", status: "hidden_by_admin" });

  const result = await ReviewDAL.public().listByListing(listingId);
  expect(result.map((r) => r.title)).toEqual(["По-ново", "По-старо"]);
  expect(result[0]?.images).toEqual([{ id: expect.any(String), cfImageId: "cf-test-image-1", alt: "Декорация на залата" }]);
  expect(result[1]?.images).toEqual([]);
  expect(result[0]?.ratingOverall).toBeCloseTo(5, 2);
});

test("listByListing(): празна обява (без ревюта) → []", async () => {
  const { listingId } = await newOwner();
  const result = await ReviewDAL.public().listByListing(listingId);
  expect(result).toEqual([]);
});

test("findReminderTargets(): completed резервация без ревю на целевата дата се връща; с ревю или друга дата — не", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const targetDate = "2026-02-15";
  const withoutReview = await bookingFor(listingId, customer.id, { eventDate: targetDate });
  const withReview = await bookingFor(listingId, customer.id, { eventDate: targetDate });
  await createTestReview(withReview, listingId, customer.id);
  const otherDate = await bookingFor(listingId, customer.id, { eventDate: "2026-02-16" });
  const stillPending = await bookingFor(listingId, customer.id, { eventDate: targetDate, status: "pending" });

  const targets = await ReviewDAL.findReminderTargets(targetDate);
  const bookingIds = targets.map((t) => t.bookingId);
  expect(bookingIds).toContain(withoutReview);
  expect(bookingIds).not.toContain(withReview);
  expect(bookingIds).not.toContain(otherDate);
  expect(bookingIds).not.toContain(stillPending);

  const target = targets.find((t) => t.bookingId === withoutReview);
  expect(target?.email).toBe(customer.email);
});

test("listForOwner: само ревюта по обявите на owner-а, с listingTitle; removed се изключва; чужд owner не вижда", async () => {
  const { owner, listingId } = await newOwner();
  const customer = await newCustomer();
  const b1 = await bookingFor(listingId, customer.id);
  const r = await createTestReview(b1, listingId, customer.id, { title: "Отлично", status: "visible" });
  const b2 = await bookingFor(listingId, customer.id, { eventDate: "2026-01-02" });
  const rHidden = await createTestReview(b2, listingId, customer.id, { title: "Скрито", status: "hidden_by_admin" });
  const b3 = await bookingFor(listingId, customer.id, { eventDate: "2026-01-03" });
  await createTestReview(b3, listingId, customer.id, { title: "Премахнато", status: "removed" });

  const mine = await ReviewDAL.for(asSessionUser(owner)).listForOwner();
  const ids = mine.map((x) => x.id);
  expect(ids).toContain(r.id);
  expect(ids).toContain(rHidden.id);
  expect(mine.some((x) => x.title === "Премахнато")).toBe(false); // removed изключено
  expect(mine.find((x) => x.id === rHidden.id)?.status).toBe("hidden_by_admin");
  expect(mine.every((x) => x.listingTitle.length > 0)).toBe(true);

  const { owner: stranger } = await newOwner();
  const theirs = await ReviewDAL.for(asSessionUser(stranger)).listForOwner();
  expect(theirs.some((x) => x.id === r.id)).toBe(false);
});

test("mine(bookingId): авторът вижда своето ревю с canEdit; чужд user → null; несъществуващ booking → null", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const stranger = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const created = await ReviewDAL.for(asSessionUser(customer)).create(reviewInput(bookingId));

  const mine = await ReviewDAL.for(asSessionUser(customer)).mine(bookingId);
  expect(mine?.id).toBe(created.id);
  expect(mine?.canEdit).toBe(true);

  expect(await ReviewDAL.for(asSessionUser(stranger)).mine(bookingId)).toBeNull();
  expect(await ReviewDAL.for(asSessionUser(customer)).mine("00000000-0000-0000-0000-000000000000")).toBeNull();
});

test("mine(bookingId): извън 48ч прозореца → canEdit=false, но ревюто пак се връща", async () => {
  const { listingId } = await newOwner();
  const customer = await newCustomer();
  const bookingId = await bookingFor(listingId, customer.id);
  const past = new Date(Date.now() - 60 * 60 * 1000);
  await createTestReview(bookingId, listingId, customer.id, { editableUntil: past });

  const mine = await ReviewDAL.for(asSessionUser(customer)).mine(bookingId);
  expect(mine).not.toBeNull();
  expect(mine?.canEdit).toBe(false);
});

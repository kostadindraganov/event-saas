import { afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, cleanupTestUser, createTestListing, createTestServiceType, createTestBooking,
  createTestReview, getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { ReviewMediaDAL } from "./review-media.dal";

vi.mock("next/cache", () => ({ revalidateTag: () => {} }));
// избягва реален CF мрежов повик в теста — requestUpload/remove само трябва да ГИ ВИКАТ правилно,
// не да проверяват реалния Cloudflare Images API (виж lib/images.ts).
vi.mock("@/lib/images", () => ({
  requestDirectUpload: vi.fn(async () => ({ cfImageId: "cf-mock-id", uploadURL: "https://upload.example/mock" })),
  deleteImage: vi.fn(async () => {}),
}));

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

function asSessionUser(u: { id: string; email: string }): SessionUser {
  return { id: u.id, email: u.email, name: "Тест", isAdmin: false };
}

async function authoredReview(): Promise<{ author: { id: string; email: string }; reviewId: string }> {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(owner.id, { status: "published", categoryId, cityId });
  const author = await createTestUser();
  cleanupIds.push(author.id);
  const st = await createTestServiceType(l.id, { kind: "full_day" });
  const b = await createTestBooking(l.id, st.id, author.id, {
    status: "completed", isFullDay: true, eventDate: "2026-01-01", phone: "0888000000",
  });
  const r = await createTestReview(b.id, l.id, author.id);
  return { author, reviewId: r.id };
}

test("requestUpload(): несъществуващо ревю → NOT_FOUND", async () => {
  const author = await createTestUser();
  cleanupIds.push(author.id);
  await expect(
    ReviewMediaDAL.for(asSessionUser(author)).requestUpload("00000000-0000-0000-0000-000000000000"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("requestUpload(): чужд потребител (не автор на ревюто) → NOT_FOUND", async () => {
  const { reviewId } = await authoredReview();
  const stranger = await createTestUser();
  cleanupIds.push(stranger.id);
  await expect(ReviewMediaDAL.for(asSessionUser(stranger)).requestUpload(reviewId))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("requestUpload(): авторът получава CF upload URL", async () => {
  const { author, reviewId } = await authoredReview();
  const result = await ReviewMediaDAL.for(asSessionUser(author)).requestUpload(reviewId);
  expect(result).toEqual({ cfImageId: "cf-mock-id", uploadURL: "https://upload.example/mock" });
});

test("confirm(): авторът записва снимка към ревюто", async () => {
  const { author, reviewId } = await authoredReview();
  const img = await ReviewMediaDAL.for(asSessionUser(author)).confirm(reviewId, "cf-image-abc");
  expect(img.cfImageId).toBe("cf-image-abc");
  const rows = await testDb.select().from(schema.reviewImage).where(eq(schema.reviewImage.reviewId, reviewId));
  expect(rows).toHaveLength(1);
});

test("confirm(): чужд потребител → NOT_FOUND", async () => {
  const { reviewId } = await authoredReview();
  const stranger = await createTestUser();
  cleanupIds.push(stranger.id);
  await expect(ReviewMediaDAL.for(asSessionUser(stranger)).confirm(reviewId, "cf-image-xyz"))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("confirm(): 6-та снимка над лимита от 5 → CONFLICT IMAGE_LIMIT", async () => {
  const { author, reviewId } = await authoredReview();
  const dal = ReviewMediaDAL.for(asSessionUser(author));
  for (let i = 0; i < 5; i++) await dal.confirm(reviewId, `cf-image-${i}`);
  await expect(dal.confirm(reviewId, "cf-image-overflow")).rejects.toMatchObject({ code: "CONFLICT", message: "IMAGE_LIMIT" });
});

test("remove(): авторът трие своя снимка", async () => {
  const { author, reviewId } = await authoredReview();
  const dal = ReviewMediaDAL.for(asSessionUser(author));
  const img = await dal.confirm(reviewId, "cf-image-to-remove");
  await dal.remove(img.id);
  const rows = await testDb.select().from(schema.reviewImage).where(eq(schema.reviewImage.id, img.id));
  expect(rows).toHaveLength(0);
});

test("remove(): чужд потребител → NOT_FOUND", async () => {
  const { author, reviewId } = await authoredReview();
  const img = await ReviewMediaDAL.for(asSessionUser(author)).confirm(reviewId, "cf-image-protected");
  const stranger = await createTestUser();
  cleanupIds.push(stranger.id);
  await expect(ReviewMediaDAL.for(asSessionUser(stranger)).remove(img.id))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("remove(): несъществуваща снимка → NOT_FOUND", async () => {
  const author = await createTestUser();
  cleanupIds.push(author.id);
  await expect(ReviewMediaDAL.for(asSessionUser(author)).remove("00000000-0000-0000-0000-000000000000"))
    .rejects.toMatchObject({ code: "NOT_FOUND" });
});

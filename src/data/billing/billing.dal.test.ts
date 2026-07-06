import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import type { SessionUser } from "@/data/users/require-user";
import { BillingDAL, getBillingSettings } from "./billing.dal";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function newOwner(): Promise<{ user: SessionUser; id: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  return { user: { id: u.id, email: u.email, name: "Тест", isAdmin: false }, id: u.id };
}

async function twoCategories(): Promise<[string, string]> {
  const cats = await testDb
    .select({ id: schema.category.id })
    .from(schema.category)
    .orderBy(schema.category.slug)
    .limit(2);
  if (cats.length < 2) throw new Error("seed липсва: нужни ≥2 категории (npm run db:seed)");
  return [cats[0]!.id, cats[1]!.id];
}

async function publishedListing(user: SessionUser, categoryId: string, cityId: string, title: string): Promise<string> {
  const draft = await ListingDAL.for(user).createDraft({ title, categoryId, cityId });
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, draft.id));
  return draft.id;
}

function checkPublish(userId: string, categoryId: string, excludeId: string) {
  return testDb.transaction((tx) => BillingDAL.assertCanPublish(tx, userId, categoryId, excludeId));
}

test("getBillingSettings(): връща валидни (seed или code-side default) граници", async () => {
  const s = await getBillingSettings();
  expect(s.limits.standard).toBeGreaterThanOrEqual(1);
  expect(s.limits.premiumPerCategory).toBeGreaterThanOrEqual(1);
  expect(s.graceDays).toBeGreaterThanOrEqual(1);
});

test("без subscription ред → NO_SUBSCRIPTION", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Ентайтълмънт Без Абонамент", categoryId: categoryA!, cityId });
  await expect(checkPublish(id, categoryA!, draft.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });
});

test("standard с 1 published → LIMIT_REACHED на втора; собствената обява е excluded от броенето", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  await createTestSubscription(id, { plan: "standard", status: "active" });
  const first = await publishedListing(user, categoryA!, cityId, "Стандарт Публикувана");
  const second = await ListingDAL.for(user).createDraft({ title: "Стандарт Втора", categoryId: categoryA!, cityId });
  await expect(checkPublish(id, categoryA!, second.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "LIMIT_REACHED" });
  // excludeListingId изключва самата вече публикувана обява от собственото ѝ броене
  await expect(checkPublish(id, categoryA!, first)).resolves.toBeUndefined();
});

test("premium: 2 в категория ОК, 3-та в същата категория → LIMIT_REACHED, друга категория минава", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA, categoryB] = await twoCategories();
  await createTestSubscription(id, { plan: "premium", status: "active" });
  await publishedListing(user, categoryA!, cityId, "Премиум 1");
  await publishedListing(user, categoryA!, cityId, "Премиум 2");
  const third = await ListingDAL.for(user).createDraft({ title: "Премиум 3", categoryId: categoryA!, cityId });
  await expect(checkPublish(id, categoryA!, third.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "LIMIT_REACHED" });
  const otherCategory = await ListingDAL.for(user).createDraft({ title: "Премиум Друга Категория", categoryId: categoryB!, cityId });
  await expect(checkPublish(id, categoryB!, otherCategory.id)).resolves.toBeUndefined();
});

test("past_due в гратис → минава; изтекъл гратис → NO_SUBSCRIPTION", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await createTestSubscription(id, { plan: "standard", status: "past_due", graceUntil: future });
  const a = await ListingDAL.for(user).createDraft({ title: "Гратис Тест", categoryId: categoryA!, cityId });
  await expect(checkPublish(id, categoryA!, a.id)).resolves.toBeUndefined();

  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await createTestSubscription(id, { plan: "standard", status: "past_due", graceUntil: past });
  const b = await ListingDAL.for(user).createDraft({ title: "Изтекъл Гратис Тест", categoryId: categoryA!, cityId });
  await expect(checkPublish(id, categoryA!, b.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });
});

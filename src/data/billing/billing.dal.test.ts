import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, createTestPromotion, getTestCityId, testDb } from "@/test/db-helpers";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import type { SessionUser } from "@/data/users/require-user";
import { BillingDAL, getBillingSettings } from "./billing.dal";

// ponytail: revalidateTag извън заявка/render хвърля "static generation store missing";
// projectOrderEvent го вика след insert — стъбваме го (същата конвенция като catalog.test.ts).
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

// POLAR_PRODUCT_* липсват в .env — стъбваме ги, за да мапва mapPlan(productId) в теста.
beforeAll(() => {
  vi.stubEnv("POLAR_PRODUCT_STANDARD_MONTHLY", "prod_standard_monthly");
  vi.stubEnv("POLAR_PRODUCT_STANDARD_YEARLY", "prod_standard_yearly");
  vi.stubEnv("POLAR_PRODUCT_PREMIUM_MONTHLY", "prod_premium_monthly");
  vi.stubEnv("POLAR_PRODUCT_PREMIUM_YEARLY", "prod_premium_yearly");
  vi.stubEnv("POLAR_PRODUCT_PROMOTION", "prod_promotion");
});
afterAll(() => vi.unstubAllEnvs());

function payload(userId: string, opts: { status: string; productId: string }) {
  return {
    customer: { externalId: userId },
    data: {
      id: `sub_${userId}`,
      status: opts.status,
      currentPeriodEnd: "2026-08-06T00:00:00.000Z",
      productId: opts.productId,
    },
  };
}

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

test("projectSubscriptionEvent: active → upsert; повторен същия payload → 1 ред (идемпотентно)", async () => {
  const { id } = await newOwner();
  const p = payload(id, { status: "active", productId: "prod_standard_monthly" });
  await BillingDAL.projectSubscriptionEvent(p);
  await BillingDAL.projectSubscriptionEvent(p);
  const rows = await testDb.select().from(schema.subscription).where(eq(schema.subscription.userId, id));
  expect(rows.length).toBe(1);
  expect(rows[0]?.status).toBe("active");
  expect(rows[0]?.plan).toBe("standard");
  expect(rows[0]?.graceUntil).toBeNull();
});

test("projectSubscriptionEvent: active → past_due сетва graceUntil; повторен past_due НЕ го мести (set-once); active чисти", async () => {
  const { id } = await newOwner();
  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "active", productId: "prod_standard_monthly" }));
  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "past_due", productId: "prod_standard_monthly" }));
  const [first] = await testDb.select().from(schema.subscription).where(eq(schema.subscription.userId, id));
  expect(first?.status).toBe("past_due");
  expect(first?.graceUntil).not.toBeNull();
  const firstGrace = first?.graceUntil;

  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "past_due", productId: "prod_standard_monthly" }));
  const [second] = await testDb.select().from(schema.subscription).where(eq(schema.subscription.userId, id));
  expect(second?.graceUntil?.getTime()).toBe(firstGrace?.getTime());

  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "active", productId: "prod_standard_monthly" }));
  const [cleared] = await testDb.select().from(schema.subscription).where(eq(schema.subscription.userId, id));
  expect(cleared?.graceUntil).toBeNull();
});

test("projectSubscriptionEvent: revoked → скрива всички published обяви (hiddenBySystem)", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "active", productId: "prod_standard_monthly" }));
  const lid = await publishedListing(user, categoryA!, cityId, "Скрий При Revoke");

  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "revoked", productId: "prod_standard_monthly" }));

  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, lid));
  expect(row?.status).toBe("hidden");
  expect(row?.hiddenBySystem).toBe(true);
});

test("projectSubscriptionEvent: downgrade premium→standard с >1 published → скрива всички", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  await createTestSubscription(id, { plan: "premium", status: "active" });
  const a = await publishedListing(user, categoryA!, cityId, "Downgrade А");
  const b = await publishedListing(user, categoryA!, cityId, "Downgrade Б");

  await BillingDAL.projectSubscriptionEvent(payload(id, { status: "active", productId: "prod_standard_monthly" }));

  const [rowA] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, a));
  const [rowB] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, b));
  expect(rowA?.status).toBe("hidden");
  expect(rowA?.hiddenBySystem).toBe(true);
  expect(rowB?.status).toBe("hidden");
  expect(rowB?.hiddenBySystem).toBe(true);
});

test("expireGracePeriods: изтекъл гратис → скрива и включва потребителя в users[]; активен статус е незасегнат; повторен run → 0 hidden (идемпотентно)", async () => {
  const expiredOwner = await newOwner();
  const activeOwner = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();

  await createTestSubscription(expiredOwner.id, {
    plan: "standard",
    status: "past_due",
    graceUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  const expiredListing = await publishedListing(expiredOwner.user, categoryA!, cityId, "DAL Изтекъл Гратис");

  await createTestSubscription(activeOwner.id, { plan: "standard", status: "active" });
  const activeListing = await publishedListing(activeOwner.user, categoryA!, cityId, "DAL Активен");

  const result = await BillingDAL.expireGracePeriods();
  expect(result.hidden).toBeGreaterThanOrEqual(1);
  expect(result.users).toContain(expiredOwner.id);
  expect(result.users).not.toContain(activeOwner.id);

  const [rowExpired] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, expiredListing));
  expect(rowExpired?.status).toBe("hidden");
  expect(rowExpired?.hiddenBySystem).toBe(true);
  const [rowActive] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, activeListing));
  expect(rowActive?.status).toBe("published");

  // повторен run между два реда не удвоява скриването (hideAllPublished филтрира WHERE status='published')
  const second = await BillingDAL.expireGracePeriods();
  expect(second.users).not.toContain(expiredOwner.id);
});

test("expireGracePeriods: per-user грешка не убива batch-а (resolve, не throw); след fix-а скрива на следващия run", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  await createTestSubscription(id, {
    plan: "standard",
    status: "past_due",
    graceUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
  });
  const lid = await publishedListing(user, categoryA!, cityId, "Batch Resilience Тест");

  // всяка per-user транзакция гърми → методът пак resolve-ва (catch е вътре в цикъла)
  const spy = vi.spyOn(db, "transaction").mockRejectedValue(new Error("boom"));
  await expect(BillingDAL.expireGracePeriods()).resolves.toEqual({ hidden: 0, users: [] });
  spy.mockRestore();

  // без грешката следващият run си скрива нормално
  const result = await BillingDAL.expireGracePeriods();
  expect(result.users).toContain(id);
  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, lid));
  expect(row?.status).toBe("hidden");
});

test("getBillingSettings(): promo defaults (seed или code-side)", async () => {
  const s = await getBillingSettings();
  expect(s.promo.durationDays).toBeGreaterThanOrEqual(1);
  expect(s.promo.premiumSlots).toBeGreaterThanOrEqual(1);
  expect(s.promo.carouselSize).toBeGreaterThanOrEqual(1);
});

test("activePromotionForListing: без ред → false; активна (startsAt<=now<endsAt) → true", async () => {
  const { user } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Промо Guard Тест", categoryId: categoryA!, cityId });
  const now = new Date();

  await expect(testDb.transaction((tx) => BillingDAL.activePromotionForListing(tx, draft.id))).resolves.toBe(false);

  await createTestPromotion(draft.id, {
    source: "purchased",
    startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });
  await expect(testDb.transaction((tx) => BillingDAL.activePromotionForListing(tx, draft.id))).resolves.toBe(true);
});

test("activePromotionForListing: изтекла (endsAt<now) → false", async () => {
  const { user } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Промо Изтекла Тест", categoryId: categoryA!, cityId });
  const now = new Date();
  await createTestPromotion(draft.id, {
    source: "purchased",
    startsAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  });
  await expect(testDb.transaction((tx) => BillingDAL.activePromotionForListing(tx, draft.id))).resolves.toBe(false);
});

test("activePromotionForListing: незапочнала (startsAt>now) → false", async () => {
  const { user } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Промо Незапочнала Тест", categoryId: categoryA!, cityId });
  const now = new Date();
  await createTestPromotion(draft.id, {
    source: "purchased",
    startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000),
  });
  await expect(testDb.transaction((tx) => BillingDAL.activePromotionForListing(tx, draft.id))).resolves.toBe(false);
});

test("countActiveIncludedPromotions: брои само активни 'premium_included' на owner-а, не 'purchased'", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA, categoryB] = await twoCategories();
  const a = await ListingDAL.for(user).createDraft({ title: "Промо Слот А", categoryId: categoryA!, cityId });
  const b = await ListingDAL.for(user).createDraft({ title: "Промо Слот Б", categoryId: categoryB!, cityId });
  await createTestPromotion(a.id, { source: "premium_included" });
  await createTestPromotion(b.id, { source: "purchased" });
  await expect(testDb.transaction((tx) => BillingDAL.countActiveIncludedPromotions(tx, id))).resolves.toBe(1);
});

function orderPayload(
  userId: string,
  listingId: string | null,
  opts: { orderId: string; productId?: string },
) {
  return {
    customer: { externalId: userId },
    data: {
      id: opts.orderId,
      productId: opts.productId ?? "prod_promotion",
      paid: true,
      metadata: listingId === null ? {} : { referenceId: listingId },
    },
  };
}

test("projectOrderEvent: happy path → insert 'purchased' ред с polarOrderId и endsAt = now+durationDays", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Поръчка Промо", categoryId: categoryA!, cityId });
  const before = Date.now();

  await BillingDAL.projectOrderEvent(orderPayload(id, draft.id, { orderId: "order_happy_1" }));

  const rows = await testDb.select().from(schema.promotion).where(eq(schema.promotion.listingId, draft.id));
  expect(rows.length).toBe(1);
  expect(rows[0]?.source).toBe("purchased");
  expect(rows[0]?.polarOrderId).toBe("order_happy_1");
  const { promo } = await getBillingSettings();
  const expectedEnds = before + promo.durationDays * 24 * 60 * 60 * 1000;
  expect(rows[0]!.endsAt.getTime()).toBeGreaterThanOrEqual(expectedEnds - 5000);
  expect(rows[0]!.endsAt.getTime()).toBeLessThanOrEqual(expectedEnds + 5000);
});

test("projectOrderEvent: дублиран polarOrderId → повторен webhook не създава втори ред (идемпотентно)", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Поръчка Дубъл", categoryId: categoryA!, cityId });
  const p = orderPayload(id, draft.id, { orderId: "order_dup_2" });

  await BillingDAL.projectOrderEvent(p);
  await BillingDAL.projectOrderEvent(p);

  const rows = await testDb.select().from(schema.promotion).where(eq(schema.promotion.listingId, draft.id));
  expect(rows.length).toBe(1);
});

test("projectOrderEvent: metadata.referenceId сочи чужда обява → skip, никакъв ред, не хвърля", async () => {
  const owner = await newOwner();
  const other = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const otherListing = await ListingDAL.for(other.user).createDraft({ title: "Чужда Промо Обява", categoryId: categoryA!, cityId });

  await expect(
    BillingDAL.projectOrderEvent(orderPayload(owner.id, otherListing.id, { orderId: "order_foreign_1" })),
  ).resolves.toBeUndefined();

  const rows = await testDb.select().from(schema.promotion).where(eq(schema.promotion.listingId, otherListing.id));
  expect(rows).toEqual([]);
});

test("projectOrderEvent: непознат productId → ignore, никакъв ред", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Непознат Продукт", categoryId: categoryA!, cityId });

  await BillingDAL.projectOrderEvent(orderPayload(id, draft.id, { orderId: "order_unknown_product", productId: "prod_other" }));

  const rows = await testDb.select().from(schema.promotion).where(eq(schema.promotion.listingId, draft.id));
  expect(rows).toEqual([]);
});

test("projectOrderEvent: вече активна промоция на обявата → skip (guard #2), не хвърля", async () => {
  const { user, id } = await newOwner();
  const cityId = await getTestCityId();
  const [categoryA] = await twoCategories();
  const draft = await ListingDAL.for(user).createDraft({ title: "Вече Промотирана", categoryId: categoryA!, cityId });
  await createTestPromotion(draft.id, { source: "premium_included" });

  await expect(
    BillingDAL.projectOrderEvent(orderPayload(id, draft.id, { orderId: "order_already_promoted" })),
  ).resolves.toBeUndefined();

  const rows = await testDb.select().from(schema.promotion).where(eq(schema.promotion.listingId, draft.id));
  expect(rows.length).toBe(1);
  expect(rows[0]?.source).toBe("premium_included");
});

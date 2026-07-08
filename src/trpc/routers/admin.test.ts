import { afterEach, expect, test, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { appRouter } from "./_app";
import { createCallerFactory } from "../init";
import {
  createTestUser,
  cleanupTestUser,
  createTestSubscription,
  createTestListing,
  getTestCategoryId,
  getTestCityId,
  testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";

// ponytail: revalidateTag извън заявка/render хвърля "static generation store missing" — no-op mock (виж catalog.test.ts)
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const createCaller = createCallerFactory(appRouter);
const admin = createCaller({ user: { id: "admin-test", email: "a@ev.test", name: "Админ", isAdmin: true } });
const anon = createCaller({ user: null });
const plain = createCaller({ user: { id: "u2", email: "u@ev.test", name: "У", isAdmin: false } });

const createdCategoryIds: string[] = [];
afterEach(async () => {
  if (createdCategoryIds.length) {
    await testDb.delete(schema.category).where(inArray(schema.category.id, createdCategoryIds));
    createdCategoryIds.length = 0;
  }
});

test("adminProcedure: anon→UNAUTHORIZED, non-admin→FORBIDDEN", async () => {
  await expect(anon.admin.dashboard.stats()).rejects.toThrow();
  await expect(plain.admin.dashboard.stats()).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("admin.dashboard.stats връща числови метрики", async () => {
  const stats = await admin.admin.dashboard.stats();
  expect(typeof stats.pendingListings).toBe("number");
  expect(typeof stats.publishedListings).toBe("number");
});

test("admin.taxonomy.category.create → list → update(isActive:false) (soft-delete)", async () => {
  const slug = `test-cat-${randomUUID().slice(0, 8)}`;
  const { id } = await admin.admin.taxonomy.category.create({ slug, nameBg: "Р", nameEn: "R", sortOrder: 88 });
  createdCategoryIds.push(id);
  const listed = await admin.admin.taxonomy.category.list();
  expect(listed.some((c) => c.id === id)).toBe(true);
  await admin.admin.taxonomy.category.update({ id, isActive: false });
  const after = (await admin.admin.taxonomy.category.list()).find((c) => c.id === id);
  expect(after?.isActive).toBe(false);
});

test("admin.user.block self → FORBIDDEN/SELF_ACTION (self-guard bubbles от DAL)", async () => {
  await expect(admin.admin.user.block({ id: "admin-test" })).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "SELF_ACTION",
  });
});

test("admin.listing.approve делегира AdminDAL.approve → pending_approval минава в published", async () => {
  const owner = await createTestUser();
  await createTestSubscription(owner.id, { plan: "premium", status: "active" });
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const pending = await createTestListing(owner.id, { status: "pending_approval", categoryId, cityId });

  const result = await admin.admin.listing.approve({ id: pending.id });
  expect(result.status).toBe("published");

  await cleanupTestUser(owner.id);
});

test("admin.report.list/resolve: non-admin → FORBIDDEN", async () => {
  await expect(plain.admin.report.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(plain.admin.report.resolve({ id: randomUUID(), action: "dismiss" }))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("admin.report.list/resolve делегира AdminDAL: listing target hide → listing.status=hidden", async () => {
  const owner = await createTestUser();
  const reporter = await createTestUser();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const target = await createTestListing(owner.id, { status: "published", categoryId, cityId });
  const [rpt] = await testDb.insert(schema.report).values({
    targetType: "listing", targetId: target.id, reporterId: reporter.id, reason: "Нередност",
  }).returning();

  const listed = await admin.admin.report.list();
  expect(listed.some((r) => r.id === rpt!.id)).toBe(true);

  await admin.admin.report.resolve({ id: rpt!.id, action: "hide" });
  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, target.id));
  expect(row?.status).toBe("hidden");

  await testDb.delete(schema.report).where(eq(schema.report.id, rpt!.id));
  await cleanupTestUser(owner.id);
  await cleanupTestUser(reporter.id);
});

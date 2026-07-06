import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, cleanupTestUser, createTestSubscription,
  getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import { listing } from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { BillingDAL } from "./billing.dal";
import type { SessionUser } from "@/data/users/require-user";

let vendor: SessionUser, other: SessionUser;
let vendorId: string, otherId: string;
let categoryId: string, categoryNameBg: string;

beforeAll(async () => {
  const v = await createTestUser();
  const o = await createTestUser();
  vendorId = v.id; otherId = o.id;
  vendor = { id: v.id, email: v.email, name: "Вендор", isAdmin: false };
  other = { id: o.id, email: o.email, name: "Друг", isAdmin: false };
  categoryId = await getTestCategoryId();
  categoryNameBg = (await testDb.query.category.findFirst({ where: (c, { eq }) => eq(c.id, categoryId) }))!.nameBg;
});

afterAll(async () => {
  await cleanupTestUser(vendorId);
  await cleanupTestUser(otherId);
});

// помощник: системно скрий (симулира downgrade/grace-expiry hide без да зависи от Задачи 5/7).
// НЕ минава през submit() — то изисква активен абонамент (assertCanPublish), а един от
// собствениците в тестовете е нарочно без абонамент; целевото състояние
// (hidden, hiddenBySystem=true) се налага директно, точно както прави системното скриване.
async function makeSystemHidden(owner: SessionUser, cityId: string, title: string) {
  const dal = ListingDAL.for(owner);
  const l = await dal.createDraft({ title, categoryId, cityId });
  await testDb.update(listing).set({ status: "hidden", hiddenBySystem: true }).where(eq(listing.id, l.id));
  return l.id;
}

test("mine(): без ред в subscription → subscription null, systemHidden []", async () => {
  const overview = await BillingDAL.for(other).mine("bg");
  expect(overview.subscription).toBeNull();
  expect(overview.systemHidden).toEqual([]);
});

test("mine(): active subscription + system-hidden обява → categoryName на подадения locale", async () => {
  const cityId = await getTestCityId();
  await createTestSubscription(vendorId, { plan: "premium", status: "active" });
  const hiddenId = await makeSystemHidden(vendor, cityId, "Систем Скрита");
  const overview = await BillingDAL.for(vendor).mine("bg");
  expect(overview.subscription).toMatchObject({ plan: "premium", status: "active" });
  expect(overview.systemHidden).toContainEqual({ id: hiddenId, title: "Систем Скрита", categoryName: categoryNameBg });
});

test("keepListing(): чужда обява → NOT_FOUND (не FORBIDDEN, без enumeration)", async () => {
  const cityId = await getTestCityId();
  const foreignId = await makeSystemHidden(other, cityId, "Чужда Скрита");
  await expect(BillingDAL.for(vendor).keepListing(foreignId)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("keepListing(): публикува избраната, скрива останалите published сестри на собственика", async () => {
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(vendor);
  const a = await dal.createDraft({ title: "Запази А", categoryId, cityId });
  await dal.submit(a.id);
  const bId = await makeSystemHidden(vendor, cityId, "Запази Б");
  await BillingDAL.for(vendor).keepListing(bId);
  const [rowA] = await testDb.select().from(listing).where(eq(listing.id, a.id));
  const [rowB] = await testDb.select().from(listing).where(eq(listing.id, bId));
  expect(rowA?.status).toBe("hidden");
  expect(rowA?.hiddenBySystem).toBe(true);
  expect(rowB?.status).toBe("published");
  expect(rowB?.hiddenBySystem).toBe(false);
});

test("restoreListings(): без subscription → NO_SUBSCRIPTION", async () => {
  await expect(BillingDAL.for(other).restoreListings()).rejects.toMatchObject({
    code: "FORBIDDEN", message: "NO_SUBSCRIPTION",
  });
});

test("restoreListings(): standard с 2 hidden обяви (лимит=1) → LIMIT_REACHED, нищо не се променя", async () => {
  const u = await createTestUser();
  const uu: SessionUser = { id: u.id, email: u.email, name: "Стандарт", isAdmin: false };
  await createTestSubscription(u.id, { plan: "standard", status: "active" });
  const cityId = await getTestCityId();
  const h1 = await makeSystemHidden(uu, cityId, "Ст 1");
  const h2 = await makeSystemHidden(uu, cityId, "Ст 2");
  await expect(BillingDAL.for(uu).restoreListings()).rejects.toMatchObject({
    code: "FORBIDDEN", message: "LIMIT_REACHED",
  });
  const [row1] = await testDb.select().from(listing).where(eq(listing.id, h1));
  const [row2] = await testDb.select().from(listing).where(eq(listing.id, h2));
  expect(row1?.status).toBe("hidden");
  expect(row2?.status).toBe("hidden");
  await cleanupTestUser(u.id);
});

test("restoreListings(): premium, 2 hidden в 1 категория (лимит=2/категория) → и двете се възстановяват", async () => {
  const u = await createTestUser();
  const uu: SessionUser = { id: u.id, email: u.email, name: "Премиум", isAdmin: false };
  await createTestSubscription(u.id, { plan: "premium", status: "active" });
  const cityId = await getTestCityId();
  const h1 = await makeSystemHidden(uu, cityId, "Пр 1");
  const h2 = await makeSystemHidden(uu, cityId, "Пр 2");
  const result = await BillingDAL.for(uu).restoreListings();
  expect(result.restored).toBe(2);
  const [row1] = await testDb.select().from(listing).where(eq(listing.id, h1));
  const [row2] = await testDb.select().from(listing).where(eq(listing.id, h2));
  expect(row1?.status).toBe("published");
  expect(row2?.status).toBe("published");
  await cleanupTestUser(u.id);
});

import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { TaxonomyDAL } from "./taxonomy.dal";
import { ListingDAL } from "./listing.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let ownerId: string;

beforeAll(async () => {
  const u = await createTestUser();
  ownerId = u.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  // submit() изисква активен план (M2.1 Задача 3)
  await createTestSubscription(ownerId, { plan: "premium", status: "active" });
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  const dal = ListingDAL.for(owner);
  const l = await dal.createDraft({ title: "Recent Тест Обява", categoryId: cat!.id, cityId: await getTestCityId() });
  await dal.submit(l.id);
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
});

test("categoryBySlug връща реда; несъществуващ → null", async () => {
  const c = await TaxonomyDAL.public().categoryBySlug("fotografi");
  expect(c).toMatchObject({ slug: "fotografi", nameBg: "Фотографи", nameEn: "Photographers" });
  expect(await TaxonomyDAL.public().categoryBySlug("nyama")).toBeNull();
});

test("regionBySlug връща реда; несъществуващ → null", async () => {
  const r = await TaxonomyDAL.public().regionBySlug("plovdiv");
  expect(r).toMatchObject({ slug: "plovdiv", name: "Пловдив" });
  expect(await TaxonomyDAL.public().regionBySlug("nyama")).toBeNull();
});

test("cityBySlug връща name + regionName; несъществуващ → null", async () => {
  const c = await TaxonomyDAL.public().cityBySlug("plovdiv");
  expect(c).toMatchObject({ name: "Пловдив", regionName: "Пловдив" });
  expect(await TaxonomyDAL.public().cityBySlug("nyama")).toBeNull();
});

test("listCategoriesWithCounts връща активните категории с брой published", async () => {
  const cats = await TaxonomyDAL.public().listCategoriesWithCounts();
  expect(cats.length).toBeGreaterThanOrEqual(17);
  const foto = cats.find((c) => c.slug === "fotografi");
  expect(foto!.publishedCount).toBeGreaterThanOrEqual(1);
  expect(cats.every((c) => typeof c.publishedCount === "number")).toBe(true);
});

test("recent връща published карти, най-новите първо", async () => {
  const items = await ListingDAL.public().recent(10);
  expect(items.length).toBeGreaterThanOrEqual(1);
  expect(items[0]!.publishedAt >= items[items.length - 1]!.publishedAt).toBe(true);
  expect(items.some((i) => i.title === "Recent Тест Обява")).toBe(true);
});

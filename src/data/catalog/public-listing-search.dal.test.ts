import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let ownerId: string, categoryId: string, cityId: string;
let l1Id: string, l2Id: string, draftId: string;
// ponytail: споделена dev Neon — други тестове/агенти публикуват успоредно,
// затова асертваме върху id-тата на seed-натите тук обяви, не върху глобални бройки.

beforeAll(async () => {
  const u = await createTestUser();
  ownerId = u.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  // submit() изисква активен план (M2.1 Задача 3); premium → 2 published в fotografi
  await createTestSubscription(ownerId, { plan: "premium", status: "active" });
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  cityId = await getTestCityId();
  const dal = ListingDAL.for(owner);
  const l1 = await dal.createDraft({ title: "Сватбен фотограф Пловдив", categoryId, cityId });
  await dal.update({ id: l1.id, description: "Емоционална фотография за вашия ден." });
  await dal.submit(l1.id);
  l1Id = l1.id;
  const l2 = await dal.createDraft({ title: "Корпоративно видео", categoryId, cityId });
  await dal.submit(l2.id);
  l2Id = l2.id;
  const draft = await dal.createDraft({ title: "Сватбен фотограф чернова", categoryId, cityId });
  draftId = draft.id;
  // остава draft
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
});

test("search намира по заглавие, само published", async () => {
  const page = await ListingDAL.public().search("фотограф", 1, 24);
  const seededIds = page.items.map((i) => i.id);
  expect(seededIds).toContain(l1Id);
  expect(seededIds).not.toContain(l2Id); // без "фотограф" в заглавие/описание
  expect(seededIds).not.toContain(draftId); // draft, не е published
  expect(page.items.find((i) => i.id === l1Id)!.title).toBe("Сватбен фотограф Пловдив");
});

test("search намира по описание", async () => {
  const page = await ListingDAL.public().search("емоционална", 1, 24);
  const seededIds = page.items.map((i) => i.id);
  expect(seededIds).toContain(l1Id);
  expect(seededIds).not.toContain(l2Id);
});

test("празна заявка връща празно", async () => {
  const page = await ListingDAL.public().search("   ", 1, 24);
  expect(page.total).toBe(0);
  expect(page.items).toEqual([]);
});

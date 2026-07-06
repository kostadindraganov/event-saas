import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId } from "@/test/db-helpers";
import { ListingDAL } from "./listing.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let stranger: SessionUser;
let ownerId: string, strangerId: string, categoryId: string, cityId: string;

beforeAll(async () => {
  const u1 = await createTestUser();
  const u2 = await createTestUser();
  ownerId = u1.id;
  strangerId = u2.id;
  owner = { id: u1.id, email: u1.email, name: "Тест", isAdmin: false };
  stranger = { id: u2.id, email: u2.email, name: "Друг", isAdmin: false };
  categoryId = await getTestCategoryId();
  cityId = await getTestCityId();
  // submit()/unhide() вече изискват активен план (Задача 3) — този файл публикува точно 1 обява за owner → standard стига
  await createTestSubscription(ownerId, { plan: "standard", status: "active" });
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
  await cleanupTestUser(strangerId);
});

test("createDraft → уникални slug-ове при same title", async () => {
  const dal = ListingDAL.for(owner);
  const a = await dal.createDraft({ title: "Фото Студио Тест", categoryId, cityId });
  const b = await dal.createDraft({ title: "Фото Студио Тест", categoryId, cityId });
  expect(a.status).toBe("draft");
  expect(a.slug).toBe("foto-studio-test");
  expect(b.slug).toBe("foto-studio-test-2");
});

test("update: описание + региони; чужд потребител → FORBIDDEN", async () => {
  const dal = ListingDAL.for(owner);
  const l = await dal.createDraft({ title: "Ъпдейт Тест", categoryId, cityId });
  const updated = await dal.update({ id: l.id, description: "Описание", wholeCountry: true });
  expect(updated.description).toBe("Описание");
  expect(updated.wholeCountry).toBe(true);
  await expect(ListingDAL.for(stranger).update({ id: l.id, title: "Хак" })).rejects.toThrow("FORBIDDEN");
});

test("submit: draft→published; повторен submit → FORBIDDEN; hide/unhide", async () => {
  const dal = ListingDAL.for(owner);
  const l = await dal.createDraft({ title: "Публикация Тест", categoryId, cityId });
  const pub = await dal.submit(l.id);
  expect(pub.status).toBe("published");
  expect(pub.publishedAt).not.toBeNull();
  await expect(dal.submit(l.id)).rejects.toThrow("FORBIDDEN");
  expect((await dal.hide(l.id)).status).toBe("hidden");
  expect((await dal.unhide(l.id)).status).toBe("published");
});

test("listMine връща само моите", async () => {
  const mine = await ListingDAL.for(owner).listMine();
  expect(mine.length).toBeGreaterThanOrEqual(3);
  const strangerList = await ListingDAL.for(stranger).listMine();
  expect(strangerList.length).toBe(0);
});

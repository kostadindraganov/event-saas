import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import type { SessionUser } from "@/data/users/require-user";

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

test("submit(): без subscription → NO_SUBSCRIPTION", async () => {
  const { user } = await newOwner();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(user);
  const draft = await dal.createDraft({ title: "Ентайтълмънт Submit Тест", categoryId, cityId });
  await expect(dal.submit(draft.id)).rejects.toThrow("NO_SUBSCRIPTION");
});

test("submit(): standard с 1 published → LIMIT_REACHED на втора; hide→unhide в лимит минава и hiddenBySystem остава false", async () => {
  const { user, id } = await newOwner();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  await createTestSubscription(id, { plan: "standard", status: "active" });
  const dal = ListingDAL.for(user);

  const first = await dal.createDraft({ title: "Лимит Първа", categoryId, cityId });
  await dal.submit(first.id);
  // M2.3: submit() → pending_approval и вече НЕ консумира лимита (мек pre-check; авторитетната
  // проверка е в AdminDAL.approve(), Задача 5, все още несъществуваща). Директен DB update
  // симулира одобрение, за да остане тестваем самият LIMIT_REACHED pre-check в submit().
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, first.id));

  const second = await dal.createDraft({ title: "Лимит Втора", categoryId, cityId });
  await expect(dal.submit(second.id)).rejects.toThrow("LIMIT_REACHED");

  // ръчен hide освобождава лимита; unhide (в лимит) минава; hiddenBySystem не се пипа от ръчния hide → остава false
  await dal.hide(first.id);
  const unhidden = await dal.unhide(first.id);
  expect(unhidden.status).toBe("published");
  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, first.id));
  expect(row?.hiddenBySystem).toBe(false);
});

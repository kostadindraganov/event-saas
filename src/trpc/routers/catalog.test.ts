import { afterAll, beforeAll, expect, test } from "vitest";
import { appRouter } from "./_app";
import { createCallerFactory } from "../init";
import { createTestUser, cleanupTestUser, getTestCategoryId, getTestCityId } from "@/test/db-helpers";

const createCaller = createCallerFactory(appRouter);
let userId: string;
let caller: ReturnType<typeof createCaller>;
let categoryId: string, cityId: string;

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.id;
  caller = createCaller({ user: { id: u.id, email: u.email, name: "Тест", isAdmin: false } });
  categoryId = await getTestCategoryId();
  cityId = await getTestCityId();
});

afterAll(async () => cleanupTestUser(userId));

test("category.list е public и връща 17", async () => {
  const anon = createCaller({ user: null });
  const cats = await anon.catalog.category.list();
  expect(cats).toHaveLength(17);
});

test("location.searchCities: prefix търсене", async () => {
  const anon = createCaller({ user: null });
  const hits = await anon.catalog.location.searchCities({ query: "Со" });
  expect(hits.some((c) => c.name === "София")).toBe(true);
});

test("listing flow през router-а: create→update→submit", async () => {
  const draft = await caller.catalog.listing.createDraft({ title: "Router Тест Обява", categoryId, cityId });
  expect(draft.status).toBe("draft");
  const updated = await caller.catalog.listing.update({ id: draft.id, description: "през tRPC" });
  expect(updated.description).toBe("през tRPC");
  const pub = await caller.catalog.listing.submit({ id: draft.id });
  expect(pub.status).toBe("published");
});

test("createDraft без auth → UNAUTHORIZED", async () => {
  const anon = createCaller({ user: null });
  await expect(anon.catalog.listing.createDraft({ title: "Аноним", categoryId, cityId })).rejects.toThrow();
});

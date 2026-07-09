import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./_app";
import { createCallerFactory } from "../init";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";

// ponytail: revalidateTag извън заявка/render хвърля "static generation store missing";
// мутациите в теста работят извън Next request контекст, затова mock-ваме no-op.
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const createCaller = createCallerFactory(appRouter);
let userId: string;
let caller: ReturnType<typeof createCaller>;
let categoryId: string, cityId: string;

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.id;
  caller = createCaller({ user: { id: u.id, email: u.email, name: "Тест", isAdmin: false } });
  // submit() изисква активен план (M2.1 Задача 3); premium → 2 published per категория
  await createTestSubscription(userId, { plan: "premium", status: "active" });
  categoryId = await getTestCategoryId();
  cityId = await getTestCityId();
});

afterAll(async () => cleanupTestUser(userId));

test("category.list е public и връща 17", async () => {
  const anon = createCaller({ user: null });
  const cats = await anon.catalog.category.list();
  // ponytail: глобален списък — admin taxonomy тестове могат конкурентно да добавят/трият
  // категории, затова само долна граница + присъствие на seed категория, не точна дължина.
  expect(cats.length).toBeGreaterThanOrEqual(17);
  expect(cats.some((c) => c.slug === "fotografi")).toBe(true);
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
  // M2.3: submit() → pending_approval (не published); admin approve() (Задача 5) сеща publishedAt.
  expect(pub.status).toBe("pending_approval");
});

test("createDraft без auth → UNAUTHORIZED", async () => {
  const anon = createCaller({ user: null });
  await expect(anon.catalog.listing.createDraft({ title: "Аноним", categoryId, cityId })).rejects.toThrow();
});

test("пълен flow през caller-а: draft→региони→атрибути→пакет→видео→publish", async () => {
  // категория с гарантирани атрибутни дефиниции; ако тестовата няма — fotografi
  let flowCategoryId = categoryId;
  let defs = await caller.catalog.attribute.definitionsByCategory({ categoryId: flowCategoryId });
  if (defs.length === 0) {
    const [fotografi] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
    flowCategoryId = fotografi!.id;
    defs = await caller.catalog.attribute.definitionsByCategory({ categoryId: flowCategoryId });
  }
  expect(defs.length).toBeGreaterThan(0);

  const draft = await caller.catalog.listing.createDraft({ title: "Пълен Flow Тест", categoryId: flowCategoryId, cityId });

  const regions = await caller.catalog.location.listRegions();
  const regionId = regions[0]!.id;
  await caller.catalog.listing.update({ id: draft.id, serviceRegionIds: [regionId] });

  const def = defs[0]!;
  const value =
    def.type === "boolean" ? true
    : def.type === "number" ? 5
    : def.type === "single" ? def.options![0]!.value
    : [def.options![0]!.value];
  await caller.catalog.attribute.setValues({ listingId: draft.id, values: [{ definitionId: def.id, value }] });

  await caller.catalog.package.create({ listingId: draft.id, name: "Тест пакет", priceFromCents: 100000 });

  const afterPackage = await caller.catalog.listing.getForOwner({ id: draft.id });
  expect(afterPackage.priceFromCents).toBe(100000);
  expect(afterPackage.serviceRegionIds).toHaveLength(1);

  await caller.catalog.video.add({ listingId: draft.id, url: "https://youtu.be/dQw4w9WgXcQ" });

  const published = await caller.catalog.listing.submit({ id: draft.id });
  // M2.3: submit() → pending_approval (не published); admin approve() (Задача 5) сеща publishedAt.
  expect(published.status).toBe("pending_approval");
});

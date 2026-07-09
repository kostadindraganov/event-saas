import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import { PackageDAL } from "./package.dal";
import type { SessionUser } from "@/data/users/require-user";
import type { PublicListingFilterInput } from "./public.dto";

// Уникална sentinel цена — никоя друга обява в споделената dev Neon не струва точно това,
// затова countByCity(price=PIN) връща само seed-натите тук редове, детерминистично.
const PIN = 424243;
let owner1Id: string, owner2Id: string, categoryId: string;
let cityA: string, cityB: string, cityC: string;
let cityASlug: string, cityBSlug: string, cityCSlug: string;

const base = (over: Partial<PublicListingFilterInput>): PublicListingFilterInput => ({
  categoryId, sort: "new", page: 1, perPage: 24, priceMinCents: PIN, priceMaxCents: PIN, ...over,
});

beforeAll(async () => {
  // premium планът позволява само 2 published/категория/owner (billing.dal.ts assertCanPublish),
  // затова 4-те fotografi обяви се разпределят 2+2 между двама owner-а (както sibling list-теста).
  const u1 = await createTestUser();
  owner1Id = u1.id;
  const owner1: SessionUser = { id: u1.id, email: u1.email, name: "Тест", isAdmin: false };
  const u2 = await createTestUser();
  owner2Id = u2.id;
  const owner2: SessionUser = { id: u2.id, email: u2.email, name: "Тест 2", isAdmin: false };
  await createTestSubscription(owner1Id, { plan: "premium", status: "active" });
  await createTestSubscription(owner2Id, { plan: "premium", status: "active" });
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  const cities = await testDb.select().from(schema.city).limit(3);
  cityA = cities[0]!.id; cityASlug = cities[0]!.slug;
  cityB = cities[1]!.id; cityBSlug = cities[1]!.slug;
  cityC = cities[2]!.id; cityCSlug = cities[2]!.slug;

  const mk = async (owner: SessionUser, cityId: string, wholeCountry = false) => {
    const l = await ListingDAL.for(owner).createDraft({ title: "Обява", categoryId, cityId });
    await PackageDAL.for(owner).create({ listingId: l.id, name: "П", priceFromCents: PIN });
    await ListingDAL.for(owner).submit(l.id);
    await testDb.update(schema.listing)
      .set({ status: "published", publishedAt: new Date(), wholeCountry })
      .where(eq(schema.listing.id, l.id));
    return l;
  };
  await mk(owner1, cityA);            // 2 в cityA (owner1, на cap)
  await mk(owner1, cityA);
  await mk(owner2, cityB);            // 1 в cityB (owner2)
  await mk(owner2, cityC, true);      // cityC е wholeCountry → БЕЗ пин (owner2, на cap)
});

afterAll(async () => { await cleanupTestUser(owner1Id); await cleanupTestUser(owner2Id); });

test("countByCity: групира по град, брои коректно", async () => {
  const rows = await ListingDAL.public().countByCity(base({}));
  const byId = new Map(rows.map((r) => [r.cityId, r]));
  expect(byId.get(cityA)?.count).toBe(2);
  expect(byId.get(cityB)?.count).toBe(1);
  expect(byId.get(cityA)?.slug).toBe(cityASlug);
  expect(byId.get(cityB)?.name).toBeTruthy();
});

test("countByCity: wholeCountry обявите нямат пин", async () => {
  const rows = await ListingDAL.public().countByCity(base({}));
  expect(rows.some((r) => r.cityId === cityC)).toBe(false);
});

test("countByCity: игнорира cityId от input (пиновете покриват всички градове)", async () => {
  const rows = await ListingDAL.public().countByCity(base({ cityId: cityA }));
  // въпреки cityId=cityA, cityB пак присъства
  expect(rows.some((r) => r.cityId === cityB)).toBe(true);
});

test("countByCity: друга категория → без наши редове", async () => {
  const [dj] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "dj"));
  const rows = await ListingDAL.public().countByCity(base({ categoryId: dj!.id }));
  expect(rows.some((r) => r.cityId === cityA || r.cityId === cityB)).toBe(false);
});

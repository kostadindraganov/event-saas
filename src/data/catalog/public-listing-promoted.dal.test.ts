import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, cleanupTestUser, createTestSubscription, createTestPromotion, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import { PackageDAL } from "./package.dal";
import type { SessionUser } from "@/data/users/require-user";
import type { PublicListingFilterInput } from "./public.dto";

let ownerA: SessionUser, ownerB: SessionUser, ownerC: SessionUser;
let ownerAId: string, ownerBId: string, ownerCId: string, categoryId: string, cityId: string;
const ids: Record<string, string> = {};
let seededIds: Set<string>;

const base = (over: Partial<PublicListingFilterInput>): PublicListingFilterInput => ({
  categoryId, sort: "new", page: 1, perPage: 50, ...over,
});

const HOUR = 3600_000;
const DAY = 24 * HOUR;

beforeAll(async () => {
  // ponytail: premium = макс. 2 published per категория per owner (billing.dal.ts assertCanPublish,
  // непроменима логика извън обхвата на тази задача) → 6-те seed обяви се разпределят между
  // трима owner-и (по 2 всеки), точно както в public-listing-list.dal.test.ts. Асертите са по id,
  // не по owner, така че разпределението не влияе на проверките.
  const ua = await createTestUser();
  ownerAId = ua.id;
  ownerA = { id: ua.id, email: ua.email, name: "Тест A", isAdmin: false };
  const ub = await createTestUser();
  ownerBId = ub.id;
  ownerB = { id: ub.id, email: ub.email, name: "Тест B", isAdmin: false };
  const uc = await createTestUser();
  ownerCId = uc.id;
  ownerC = { id: uc.id, email: uc.email, name: "Тест C", isAdmin: false };
  await createTestSubscription(ownerAId, { plan: "premium", status: "active" });
  await createTestSubscription(ownerBId, { plan: "premium", status: "active" });
  await createTestSubscription(ownerCId, { plan: "premium", status: "active" });
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  const [c] = await testDb.select().from(schema.city).limit(1);
  cityId = c!.id;

  const mk = async (owner: SessionUser, title: string, price: number) => {
    const l = await ListingDAL.for(owner).createDraft({ title, categoryId, cityId });
    await PackageDAL.for(owner).create({ listingId: l.id, name: "П", priceFromCents: price });
    await ListingDAL.for(owner).submit(l.id);
    return l.id;
  };

  // publishedAt нараства по ред на създаване — bezPromo е НАЙ-новата (за да провери
  // reorder-а: без promoted-first щеше да е първа под "new" сорта)
  ids.activna1 = await mk(ownerA, "Обява Активна1", 20000);
  await new Promise((r) => setTimeout(r, 10));
  ids.activna2 = await mk(ownerA, "Обява Активна2", 30000);
  await new Promise((r) => setTimeout(r, 10));
  ids.izteklaPromo = await mk(ownerB, "Обява Изтекла промо", 10000);
  await new Promise((r) => setTimeout(r, 10));
  ids.badeshtaPromo = await mk(ownerB, "Обява Бъдеща промо", 10000);
  await new Promise((r) => setTimeout(r, 10));
  ids.bezPromo = await mk(ownerC, "Обява Без промо", 25000);
  ids.skritaPromo = await mk(ownerC, "Обява Скрита промо", 10000);
  await ListingDAL.for(ownerC).hide(ids.skritaPromo);

  const now = Date.now();
  // activna2 стартирала по-късно от activna1 → трябва да е ПЪРВА (startsAt DESC)
  await createTestPromotion(ids.activna1, { source: "purchased", startsAt: new Date(now - 2 * HOUR), endsAt: new Date(now + HOUR) });
  await createTestPromotion(ids.activna2, { source: "purchased", startsAt: new Date(now - 30 * 60_000), endsAt: new Date(now + HOUR) });
  await createTestPromotion(ids.izteklaPromo, { source: "purchased", startsAt: new Date(now - 2 * DAY), endsAt: new Date(now - DAY) });
  await createTestPromotion(ids.badeshtaPromo, { source: "purchased", startsAt: new Date(now + DAY), endsAt: new Date(now + 2 * DAY) });
  await createTestPromotion(ids.skritaPromo, { source: "purchased", startsAt: new Date(now - HOUR), endsAt: new Date(now + HOUR) });

  seededIds = new Set(Object.values(ids));
});

afterAll(async () => {
  await cleanupTestUser(ownerAId);
  await cleanupTestUser(ownerBId);
  await cleanupTestUser(ownerCId);
});

test("promoted(): само активни и published, ред по startsAt DESC", async () => {
  const rows = await ListingDAL.public().promoted(50);
  const seeded = rows.filter((r) => seededIds.has(r.id)).map((r) => r.id);
  expect(seeded).toEqual([ids.activna2, ids.activna1]); // изтекла/бъдеща/скрита изключени
});

test("promoted(): limit се спазва", async () => {
  const rows = await ListingDAL.public().promoted(1);
  expect(rows.length).toBeLessThanOrEqual(1);
});

test("list() default сорт (new): promoted-first въпреки по-нова bezPromo", async () => {
  const page = await ListingDAL.public().list(base({}));
  const order = page.items.filter((i) => seededIds.has(i.id)).map((i) => i.id);
  // activna2/activna1 (promoted, по-стари) preceding bezPromo (по-нова, не promoted)
  expect(order.indexOf(ids.activna2!)).toBeLessThan(order.indexOf(ids.bezPromo!));
  expect(order.indexOf(ids.activna1!)).toBeLessThan(order.indexOf(ids.bezPromo!));
  expect(order.indexOf(ids.activna2!)).toBeLessThan(order.indexOf(ids.activna1!)); // startsAt DESC tie-break
});

test("list() explicit сорт (priceAsc) НЕ се пренарежда от promoted", async () => {
  const page = await ListingDAL.public().list(base({ sort: "priceAsc" }));
  const seededOrder = page.items.filter((i) => seededIds.has(i.id)).map((i) => i.priceFromCents);
  // чист ред по цена, независимо кои са promoted (10000,10000,10000,20000,25000,30000 — стабилен по цена)
  expect(seededOrder).toEqual([...seededOrder].sort((a, b) => (a ?? 0) - (b ?? 0)));
});

test("promoted флаг в card DTO", async () => {
  const page = await ListingDAL.public().list(base({}));
  const byId = new Map(page.items.map((i) => [i.id, i.promoted]));
  expect(byId.get(ids.activna1!)).toBe(true);
  expect(byId.get(ids.activna2!)).toBe(true);
  expect(byId.get(ids.izteklaPromo!)).toBe(false);
  expect(byId.get(ids.badeshtaPromo!)).toBe(false);
  expect(byId.get(ids.bezPromo!)).toBe(false);
});

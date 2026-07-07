import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import { PackageDAL } from "./package.dal";
import { AttributeDAL } from "./attribute.dal";
import type { SessionUser } from "@/data/users/require-user";
import type { PublicListingFilterInput } from "./public.dto";

let owner: SessionUser, owner2: SessionUser;
let ownerId: string, owner2Id: string, categoryId: string, otherCategoryId: string;
let cityA: string, cityB: string, styleDefId: string;
let draftId: string;
// ponytail: споделена dev Neon — други тестове/E2E публикуват в същата категория
// успоредно, затова асертваме върху id-тата на seed-натите тук обяви, не върху
// глобални бройки/позиции.
const seeded: { евтина?: string; средна?: string; скъпа?: string } = {};
let seededIds: Set<string>;

const base = (over: Partial<PublicListingFilterInput>): PublicListingFilterInput => ({
  categoryId, sort: "new", page: 1, perPage: 24, ...over,
});

beforeAll(async () => {
  const u = await createTestUser();
  ownerId = u.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  const u2 = await createTestUser();
  owner2Id = u2.id;
  owner2 = { id: u2.id, email: u2.email, name: "Тест 2", isAdmin: false };
  // submit() изисква активен план (M2.1 Задача 3); premium = 2 published per категория →
  // 3-те fotografi обяви се разпределят между двама owner-а (асертите са по id, не по owner)
  await createTestSubscription(ownerId, { plan: "premium", status: "active" });
  await createTestSubscription(owner2Id, { plan: "premium", status: "active" });
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  const [cat2] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "dj"));
  otherCategoryId = cat2!.id;
  const cities = await testDb.select().from(schema.city).limit(2);
  cityA = cities[0]!.id;
  cityB = cities[1]!.id;
  const defs = await AttributeDAL.public().definitionsByCategory(categoryId);
  styleDefId = defs.find((d) => d.key === "style")!.id;
  const dal = ListingDAL.for(owner);

  const mk = async (u: SessionUser, title: string, cityId: string, price: number, style?: string[]) => {
    const l = await ListingDAL.for(u).createDraft({ title, categoryId, cityId });
    await PackageDAL.for(u).create({ listingId: l.id, name: "П", priceFromCents: price });
    if (style) await AttributeDAL.for(u).setValues(l.id, [{ definitionId: styleDefId, value: style }]);
    await ListingDAL.for(u).submit(l.id);
    // M2.3: submit() → pending_approval; admin approve() (Задача 5) още не съществува →
    // директен DB update симулира одобрение, за да остане тестът за публичния каталог валиден.
    await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, l.id));
    return l;
  };
  const evtina = await mk(owner, "Обява Евтина", cityA, 10000, ["classic"]);
  await new Promise((r) => setTimeout(r, 10));
  const srednya = await mk(owner, "Обява Средна", cityA, 30000, ["artistic"]);
  await new Promise((r) => setTimeout(r, 10));
  const skapa = await mk(owner2, "Обява Скъпа", cityB, 90000, ["classic"]);
  const draft = await dal.createDraft({ title: "Обява Чернова", categoryId, cityId: cityA });
  draftId = draft.id;
  await PackageDAL.for(owner).create({ listingId: draft.id, name: "П", priceFromCents: 5000 });
  // остава draft — не се брои
  seeded.евтина = evtina.id;
  seeded.средна = srednya.id;
  seeded.скъпа = skapa.id;
  seededIds = new Set([evtina.id, srednya.id, skapa.id]);
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
  await cleanupTestUser(owner2Id);
});

test("категория: само published, total коректен", async () => {
  const page = await ListingDAL.public().list(base({}));
  const seededInPage = page.items.filter((i) => seededIds.has(i.id));
  expect(seededInPage).toHaveLength(3); // и трите published seed-нати обяви присъстват
  expect(page.total).toBeGreaterThanOrEqual(3);
  expect(page.items.some((i) => i.id === draftId)).toBe(false);
  expect(page.items.every((i) => i.categorySlug === "fotografi")).toBe(true);
});

test("друга категория няма съвпадения", async () => {
  const page = await ListingDAL.public().list(base({ categoryId: otherCategoryId }));
  const seededInPage = page.items.filter((i) => seededIds.has(i.id));
  expect(seededInPage).toHaveLength(0); // нашите fotografi seed-нати не се показват в dj
});

test("филтър по град", async () => {
  const page = await ListingDAL.public().list(base({ cityId: cityA }));
  const seededInPage = page.items.filter((i) => seededIds.has(i.id));
  expect(seededInPage.map((i) => i.id).sort()).toEqual([seeded.евтина!, seeded.средна!].sort());
});

test("ценови диапазон", async () => {
  const page = await ListingDAL.public().list(base({ priceMinCents: 20000, priceMaxCents: 50000 }));
  const seededInPage = page.items.filter((i) => seededIds.has(i.id));
  expect(seededInPage.map((i) => i.id)).toEqual([seeded.средна]); // само средната цена пасва
});

test("attrs филтър (multi any-of)", async () => {
  const page = await ListingDAL.public().list(base({ attrs: [{ definitionId: styleDefId, values: ["artistic"] }] }));
  const seededInPage = page.items.filter((i) => seededIds.has(i.id));
  expect(seededInPage.map((i) => i.id)).toEqual([seeded.средна]); // само artistic стила
});

test("сорт priceAsc / priceDesc", async () => {
  const asc = await ListingDAL.public().list(base({ sort: "priceAsc" }));
  const ascSeeded = asc.items.filter((i) => seededIds.has(i.id)).map((i) => i.priceFromCents);
  expect(ascSeeded).toEqual([10000, 30000, 90000]);
  const desc = await ListingDAL.public().list(base({ sort: "priceDesc" }));
  const descSeeded = desc.items.filter((i) => seededIds.has(i.id)).map((i) => i.priceFromCents);
  expect(descSeeded).toEqual([90000, 30000, 10000]);
});

test("сорт new = publishedAt desc (default)", async () => {
  const page = await ListingDAL.public().list(base({ sort: "new" }));
  const seededOrder = page.items.filter((i) => seededIds.has(i.id)).map((i) => i.id);
  // последно публикувана (Скъпа) първо, после Средна, после Евтина
  expect(seededOrder).toEqual([seeded.скъпа, seeded.средна, seeded.евтина]);
});

test("пагинация: perPage cap 50, page 2 не пропуска/дублира seed-натите", async () => {
  const priceFilter = { priceMinCents: 10000, priceMaxCents: 90000 };
  const p1 = await ListingDAL.public().list(base({ ...priceFilter, perPage: 2, page: 1 }));
  expect(p1.items.length).toBeLessThanOrEqual(2);
  expect(p1.total).toBeGreaterThanOrEqual(3);
  const p2 = await ListingDAL.public().list(base({ ...priceFilter, perPage: 2, page: 2 }));
  const seenSeeded = new Set(
    [...p1.items, ...p2.items].filter((i) => seededIds.has(i.id)).map((i) => i.id),
  );
  expect(seenSeeded.size).toBe(3); // и трите seed-нати обяви се виждат общо на стр. 1+2, без дублиране
  const capped = await ListingDAL.public().list(base({ perPage: 999 }));
  expect(capped.perPage).toBe(50);
});

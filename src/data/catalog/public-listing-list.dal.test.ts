import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import { PackageDAL } from "./package.dal";
import { AttributeDAL } from "./attribute.dal";
import type { SessionUser } from "@/data/users/require-user";
import type { PublicListingFilterInput } from "./public.dto";

let owner: SessionUser;
let ownerId: string, categoryId: string, otherCategoryId: string;
let cityA: string, cityB: string, styleDefId: string;

const base = (over: Partial<PublicListingFilterInput>): PublicListingFilterInput => ({
  categoryId, sort: "new", page: 1, perPage: 24, ...over,
});

beforeAll(async () => {
  const u = await createTestUser();
  ownerId = u.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
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

  const mk = async (title: string, cityId: string, price: number, style?: string[]) => {
    const l = await dal.createDraft({ title, categoryId, cityId });
    await PackageDAL.for(owner).create({ listingId: l.id, name: "П", priceFromCents: price });
    if (style) await AttributeDAL.for(owner).setValues(l.id, [{ definitionId: styleDefId, value: style }]);
    await dal.submit(l.id);
    return l;
  };
  await mk("Обява Евтина", cityA, 10000, ["classic"]);
  await new Promise((r) => setTimeout(r, 10));
  await mk("Обява Средна", cityA, 30000, ["artistic"]);
  await new Promise((r) => setTimeout(r, 10));
  await mk("Обява Скъпа", cityB, 90000, ["classic"]);
  const draft = await dal.createDraft({ title: "Обява Чернова", categoryId, cityId: cityA });
  await PackageDAL.for(owner).create({ listingId: draft.id, name: "П", priceFromCents: 5000 });
  // остава draft — не се брои
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
});

test("категория: само published, total коректен", async () => {
  const page = await ListingDAL.public().list(base({}));
  expect(page.total).toBe(3);
  expect(page.items.every((i) => i.categorySlug === "fotografi")).toBe(true);
});

test("друга категория няма съвпадения", async () => {
  const page = await ListingDAL.public().list(base({ categoryId: otherCategoryId }));
  expect(page.total).toBe(0);
});

test("филтър по град", async () => {
  const page = await ListingDAL.public().list(base({ cityId: cityA }));
  expect(page.total).toBe(2);
});

test("ценови диапазон", async () => {
  const page = await ListingDAL.public().list(base({ priceMinCents: 20000, priceMaxCents: 50000 }));
  expect(page.total).toBe(1);
  expect(page.items[0]!.title).toBe("Обява Средна");
});

test("attrs филтър (multi any-of)", async () => {
  const page = await ListingDAL.public().list(base({ attrs: [{ definitionId: styleDefId, values: ["artistic"] }] }));
  expect(page.total).toBe(1);
  expect(page.items[0]!.title).toBe("Обява Средна");
});

test("сорт priceAsc / priceDesc", async () => {
  const asc = await ListingDAL.public().list(base({ sort: "priceAsc" }));
  expect(asc.items.map((i) => i.priceFromCents)).toEqual([10000, 30000, 90000]);
  const desc = await ListingDAL.public().list(base({ sort: "priceDesc" }));
  expect(desc.items.map((i) => i.priceFromCents)).toEqual([90000, 30000, 10000]);
});

test("сорт new = publishedAt desc (default)", async () => {
  const page = await ListingDAL.public().list(base({ sort: "new" }));
  expect(page.items[0]!.title).toBe("Обява Скъпа"); // последно публикувана
});

test("пагинация: perPage cap 50, page 2 празна при 3 реда", async () => {
  const p1 = await ListingDAL.public().list(base({ perPage: 2, page: 1 }));
  expect(p1.items).toHaveLength(2);
  expect(p1.total).toBe(3);
  const p2 = await ListingDAL.public().list(base({ perPage: 2, page: 2 }));
  expect(p2.items).toHaveLength(1);
  const capped = await ListingDAL.public().list(base({ perPage: 999 }));
  expect(capped.perPage).toBe(50);
});

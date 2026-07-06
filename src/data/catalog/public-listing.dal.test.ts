import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import { PackageDAL, VideoDAL } from "./package.dal";
import { AttributeDAL } from "./attribute.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let ownerId: string, categoryId: string, cityId: string;
let publishedSlug: string, draftSlug: string, hiddenSlug: string;
let styleDefId: string;

beforeAll(async () => {
  const u = await createTestUser();
  ownerId = u.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  cityId = await getTestCityId();
  const dal = ListingDAL.for(owner);

  const l = await dal.createDraft({ title: "Публична Фото Обява", categoryId, cityId });
  publishedSlug = l.slug;
  await dal.update({ id: l.id, description: "Пълно описание на услугата.", wholeCountry: true });
  await PackageDAL.for(owner).create({ listingId: l.id, name: "Базов", priceFromCents: 50000, duration: "8 часа", included: "Обработка" });
  await VideoDAL.for(owner).add(l.id, "https://youtu.be/dQw4w9WgXcQ");
  await testDb.insert(schema.listingImage).values({ listingId: l.id, cfImageId: "cf-cover", sortOrder: 0 });
  const defs = await AttributeDAL.public().definitionsByCategory(categoryId);
  styleDefId = defs.find((d) => d.key === "style")!.id;
  await AttributeDAL.for(owner).setValues(l.id, [{ definitionId: styleDefId, value: ["classic", "artistic"] }]);
  await dal.submit(l.id); // draft → published

  const d = await dal.createDraft({ title: "Чернова Обява", categoryId, cityId });
  draftSlug = d.slug;
  const h = await dal.createDraft({ title: "Скрита Обява", categoryId, cityId });
  hiddenSlug = h.slug;
  await dal.submit(h.id);
  await dal.hide(h.id);
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
});

test("getBySlug: published връща пълния детайл в едно извикване", async () => {
  const dto = await ListingDAL.public().getBySlug(publishedSlug);
  expect(dto).not.toBeNull();
  expect(dto!.title).toBe("Публична Фото Обява");
  expect(dto!.categorySlug).toBe("fotografi");
  expect(dto!.description).toBe("Пълно описание на услугата.");
  expect(dto!.priceFromCents).toBe(50000);
  expect(dto!.coverCfImageId).toBeNull(); // cover_image_id не е сетнат от wizard-а в теста
  expect(dto!.images).toEqual([{ cfImageId: "cf-cover", sortOrder: 0 }]);
  expect(dto!.videos).toEqual([{ youtubeVideoId: "dQw4w9WgXcQ" }]);
  expect(dto!.packages).toEqual([{ id: expect.any(String), name: "Базов", priceCents: 50000, duration: "8 часа", included: "Обработка" }]);
  const styleChip = dto!.chips.find((c) => c.definitionKey === "style");
  expect(styleChip?.valuesBg.length).toBe(2);
  expect(typeof styleChip?.labelBg).toBe("string");
  expect(JSON.stringify(dto)).not.toContain("rejectionReason");
  expect(JSON.stringify(dto)).not.toContain("ownerId");
});

test("getBySlug: draft и hidden връщат null", async () => {
  expect(await ListingDAL.public().getBySlug(draftSlug)).toBeNull();
  expect(await ListingDAL.public().getBySlug(hiddenSlug)).toBeNull();
});

test("getBySlug: несъществуващ slug връща null", async () => {
  expect(await ListingDAL.public().getBySlug("nyama-takava-obiava")).toBeNull();
});

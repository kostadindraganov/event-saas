import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import { AttributeDAL } from "./attribute.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let stranger: SessionUser;
let ownerId: string, strangerId: string, listingId: string, categoryId: string;
let boolDefId: string, multiDefId: string, numberDefId: string;

beforeAll(async () => {
  const u = await createTestUser();
  const u2 = await createTestUser();
  ownerId = u.id;
  strangerId = u2.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  stranger = { id: u2.id, email: u2.email, name: "Друг", isAdmin: false };
  // категория с гарантирани дефиниции: fotografi (second_shooter boolean, style multi)
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  const defs = await AttributeDAL.public().definitionsByCategory(categoryId);
  boolDefId = defs.find((d) => d.key === "second_shooter")!.id;
  multiDefId = defs.find((d) => d.key === "style")!.id;
  numberDefId = defs.find((d) => d.key === "years_experience")!.id;
  const listing = await ListingDAL.for(owner).createDraft({ title: "Атрибути Тест", categoryId, cityId: await getTestCityId() });
  listingId = listing.id;
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
  await cleanupTestUser(strangerId);
});

test("definitionsByCategory връща seed-натите за fotografi", async () => {
  const defs = await AttributeDAL.public().definitionsByCategory(categoryId);
  expect(defs.length).toBeGreaterThanOrEqual(5);
  expect(defs.map((d) => d.key)).toContain("style");
});

test("setValues: валидни стойности + getValues ги връща", async () => {
  const dal = AttributeDAL.for(owner);
  await dal.setValues(listingId, [
    { definitionId: boolDefId, value: true },
    { definitionId: multiDefId, value: ["classic", "artistic"] },
  ]);
  const values = await dal.getValues(listingId);
  expect(values.find((v) => v.definitionId === boolDefId)?.value).toBe(true);
  expect(values.find((v) => v.definitionId === multiDefId)?.value).toEqual(["classic", "artistic"]);
});

test("setValues: невалидна multi стойност → INVALID_ATTRIBUTE_VALUE", async () => {
  await expect(
    AttributeDAL.for(owner).setValues(listingId, [{ definitionId: multiDefId, value: ["not-an-option"] }]),
  ).rejects.toThrow("INVALID_ATTRIBUTE_VALUE");
});

test("setValues: заменя изцяло (повторен set с 1 стойност оставя само 1)", async () => {
  const dal = AttributeDAL.for(owner);
  await dal.setValues(listingId, [{ definitionId: boolDefId, value: false }]);
  const values = await dal.getValues(listingId);
  expect(values).toHaveLength(1);
});

test("setValues: number — валидно 5, невалидни -1 и NaN", async () => {
  const dal = AttributeDAL.for(owner);
  await dal.setValues(listingId, [{ definitionId: numberDefId, value: 5 }]);
  const values = await dal.getValues(listingId);
  expect(values.find((v) => v.definitionId === numberDefId)?.value).toBe(5);
  await expect(
    dal.setValues(listingId, [{ definitionId: numberDefId, value: -1 }]),
  ).rejects.toThrow("INVALID_ATTRIBUTE_VALUE");
  await expect(
    dal.setValues(listingId, [{ definitionId: numberDefId, value: Number.NaN }]),
  ).rejects.toThrow("INVALID_ATTRIBUTE_VALUE");
});

test("getValues: чужд потребител → FORBIDDEN", async () => {
  await expect(AttributeDAL.for(stranger).getValues(listingId)).rejects.toThrow("FORBIDDEN");
});

test("setValues: дублиран definitionId → INVALID_ATTRIBUTE_VALUE, старите стойности оцеляват", async () => {
  const dal = AttributeDAL.for(owner);
  await dal.setValues(listingId, [{ definitionId: boolDefId, value: true }]);
  await expect(
    dal.setValues(listingId, [
      { definitionId: multiDefId, value: ["classic"] },
      { definitionId: multiDefId, value: ["artistic"] },
    ]),
  ).rejects.toThrow("INVALID_ATTRIBUTE_VALUE");
  const values = await dal.getValues(listingId);
  expect(values).toHaveLength(1);
  expect(values.find((v) => v.definitionId === boolDefId)?.value).toBe(true);
});

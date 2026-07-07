import { afterEach, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { AdminDAL } from "./admin.dal";
import { testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";

// Track на създаденото taxonomy → cleanup в FK-безопасен ред след всеки тест.
const created = {
  listingAttributeDefIds: [] as string[],
  listingIds: [] as string[],
  attrDefIds: [] as string[],
  categoryIds: [] as string[],
  cityIds: [] as string[],
  regionIds: [] as string[],
  userIds: [] as string[],
};

afterEach(async () => {
  // ред: деца преди родители (всички FK са RESTRICT)
  if (created.listingIds.length) {
    await testDb.delete(schema.listingAttribute).where(inArray(schema.listingAttribute.listingId, created.listingIds));
    await testDb.delete(schema.listingServiceRegion).where(inArray(schema.listingServiceRegion.listingId, created.listingIds));
    await testDb.delete(schema.listing).where(inArray(schema.listing.id, created.listingIds));
  }
  if (created.attrDefIds.length) await testDb.delete(schema.attributeDefinition).where(inArray(schema.attributeDefinition.id, created.attrDefIds));
  if (created.cityIds.length) await testDb.delete(schema.city).where(inArray(schema.city.id, created.cityIds));
  if (created.regionIds.length) await testDb.delete(schema.region).where(inArray(schema.region.id, created.regionIds));
  if (created.categoryIds.length) await testDb.delete(schema.category).where(inArray(schema.category.id, created.categoryIds));
  if (created.userIds.length) await testDb.delete(schema.user).where(inArray(schema.user.id, created.userIds));
  for (const k of Object.keys(created) as (keyof typeof created)[]) created[k] = [];
});

test("Задача 9: category create → update → listAdmin → softDelete", async () => {
  const slug = `test-cat-${randomUUID().slice(0, 8)}`;
  const { id } = await AdminDAL.createCategory({ slug, nameBg: "Тест", nameEn: "Test", sortOrder: 99 });
  created.categoryIds.push(id);

  await AdminDAL.updateCategory({ id, nameBg: "Тест-2" });
  const listed = await AdminDAL.listCategoriesAdmin();
  const mine = listed.find((c) => c.id === id);
  expect(mine?.nameBg).toBe("Тест-2");
  expect(mine?.isActive).toBe(true);

  await AdminDAL.softDeleteCategory(id);
  const afterSoft = (await AdminDAL.listCategoriesAdmin()).find((c) => c.id === id);
  expect(afterSoft?.isActive).toBe(false); // остава в admin списъка, но скрит от каталога

  // публичният каталог (isActive=true) вече не я вижда
  const [pub] = await testDb.select().from(schema.category).where(eq(schema.category.id, id));
  expect(pub?.isActive).toBe(false);
});

test("Задача 9: дубликат slug → CONFLICT SLUG_TAKEN", async () => {
  const slug = `test-cat-${randomUUID().slice(0, 8)}`;
  const a = await AdminDAL.createCategory({ slug, nameBg: "А", nameEn: "A", sortOrder: 0 });
  created.categoryIds.push(a.id);
  await expect(AdminDAL.createCategory({ slug, nameBg: "Б", nameEn: "B", sortOrder: 0 }))
    .rejects.toMatchObject({ code: "CONFLICT", message: "SLUG_TAKEN" });
});

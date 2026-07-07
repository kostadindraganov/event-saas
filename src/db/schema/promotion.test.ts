import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, cleanupTestUser, createTestPromotion, getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function newListing(): Promise<{ user: SessionUser; listingId: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  const user: SessionUser = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const draft = await ListingDAL.for(user).createDraft({ title: "Промо Тест Обява", categoryId, cityId });
  return { user, listingId: draft.id };
}

test("promo_order_idx: втори ред със същия polarOrderId (non-null) хвърля unique violation", async () => {
  const { listingId } = await newListing();
  await createTestPromotion(listingId, { source: "purchased", polarOrderId: "order_dup_1" });
  await expect(
    createTestPromotion(listingId, { source: "purchased", polarOrderId: "order_dup_1" }),
  ).rejects.toThrow();
});

test("polarOrderId null НЕ се засяга от unique index-а (много NULL редове позволени)", async () => {
  const { listingId } = await newListing();
  await createTestPromotion(listingId, { source: "premium_included" });
  await expect(
    createTestPromotion(listingId, { source: "premium_included" }),
  ).resolves.toMatchObject({ listingId });
});

test("cleanupTestUser: трие promotion редовете на потребителя (симетрия с listing cascade)", async () => {
  const { user, listingId } = await newListing();
  await createTestPromotion(listingId, { source: "premium_included" });
  await cleanupTestUser(user.id);
  const rows = await testDb.select().from(schema.promotion).where(eq(schema.promotion.listingId, listingId));
  expect(rows).toEqual([]);
});

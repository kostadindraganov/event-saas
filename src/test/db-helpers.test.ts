import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";

test("cleanupTestUser трие thread-ове (customer/vendor) преди user — без FK грешка", async () => {
  const a = await createTestUser(); // owner/vendor
  const b = await createTestUser(); // customer
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listing = await ListingDAL.for({ id: a.id, email: a.email, name: "A", isAdmin: false })
    .createDraft({ title: "Клийнъп Тест", categoryId, cityId });

  const [thread] = await testDb
    .insert(schema.thread)
    .values({ listingId: listing.id, customerId: b.id, vendorId: a.id })
    .returning({ id: schema.thread.id });
  await testDb.insert(schema.message).values({ threadId: thread!.id, senderId: b.id, body: "Здр" });

  // клиентският cleanup трябва да махне нишката (customer=b) и после user b — без FK violation
  await cleanupTestUser(b.id);
  expect((await testDb.select().from(schema.user).where(eq(schema.user.id, b.id))).length).toBe(0);
  expect((await testDb.select().from(schema.thread).where(eq(schema.thread.id, thread!.id))).length).toBe(0);

  await cleanupTestUser(a.id);
  expect((await testDb.select().from(schema.user).where(eq(schema.user.id, a.id))).length).toBe(0);
});

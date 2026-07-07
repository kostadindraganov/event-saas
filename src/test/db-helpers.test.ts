import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, createTestListing, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
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

test("listing.hiddenBySystem: default false на нов draft", async () => {
  const u = await createTestUser();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const created = await ListingDAL.for({ id: u.id, email: u.email, name: "Т", isAdmin: false })
    .createDraft({ title: "Хидън Систем Дефолт Тест", categoryId, cityId });
  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, created.id));
  expect(row?.hiddenBySystem).toBe(false);
  await cleanupTestUser(u.id);
});

test("createTestSubscription: вмъква ред; повторен извикване презаписва; cleanupTestUser го трие преди user — без FK грешка", async () => {
  const u = await createTestUser();
  const graceUntil = new Date(Date.now() + 86_400_000);
  const sub = await createTestSubscription(u.id, { plan: "premium", status: "past_due", graceUntil });
  expect(sub.userId).toBe(u.id);
  expect(sub.plan).toBe("premium");
  expect(sub.status).toBe("past_due");
  expect(sub.graceUntil?.getTime()).toBe(graceUntil.getTime());

  // повторно извикване (напр. друг тест сменя плана на същия owner) → delete-then-insert, не гърми на unique(userId)
  const sub2 = await createTestSubscription(u.id, { plan: "standard", status: "active" });
  expect(sub2.plan).toBe("standard");
  expect(
    (await testDb.select().from(schema.subscription).where(eq(schema.subscription.userId, u.id))).length,
  ).toBe(1);

  await cleanupTestUser(u.id);
  expect((await testDb.select().from(schema.user).where(eq(schema.user.id, u.id))).length).toBe(0);
  expect(
    (await testDb.select().from(schema.subscription).where(eq(schema.subscription.userId, u.id))).length,
  ).toBe(0);
});

test("createTestUser({isAdmin:true}) сетва is_admin; createTestListing вкарва ред със зададен статус", async () => {
  const admin = await createTestUser({ isAdmin: true });
  const [adminRow] = await testDb.select().from(schema.user).where(eq(schema.user.id, admin.id));
  expect(adminRow?.isAdmin).toBe(true);

  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const pending = await createTestListing(admin.id, { status: "pending_approval", categoryId, cityId });
  expect(pending.status).toBe("pending_approval");
  expect(pending.ownerId).toBe(admin.id);
  expect(pending.publishedAt).toBeNull();

  await cleanupTestUser(admin.id);
});

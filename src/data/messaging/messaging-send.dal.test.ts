import { afterAll, beforeAll, expect, test } from "vitest";
import { eq, ne, sql } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { MessagingDAL } from "./messaging.dal";
import type { SessionUser } from "@/data/users/require-user";

let customer: SessionUser, vendor: SessionUser;
let customerId: string, vendorId: string;
let publishedId: string;
let categoryId: string;

beforeAll(async () => {
  const c = await createTestUser();
  const v = await createTestUser();
  customerId = c.id; vendorId = v.id;
  customer = { id: c.id, email: c.email, name: "Клиент", isAdmin: false };
  vendor = { id: v.id, email: v.email, name: "Вендор", isAdmin: false };
  // submit() изисква активен план (M2.1 Задача 3); premium → 2 published per категория
  await createTestSubscription(vendorId, { plan: "premium", status: "active" });
  categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(vendor);
  const pub = await dal.createDraft({ title: "Чат Обява", categoryId, cityId });
  await dal.submit(pub.id);
  // M2.3: submit() → pending_approval; admin approve() (Задача 5) още не съществува →
  // директен DB update симулира одобрение, за да остане messaging-логиката (изисква published) тестваема.
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, pub.id));
  publishedId = pub.id;
});

afterAll(async () => {
  await cleanupTestUser(customerId);
  await cleanupTestUser(vendorId);
});

test("sendMessage: участник append-ва; MessageDTO.mine коректно", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Здр" });
  const reply = await MessagingDAL.for(vendor).sendMessage(threadId, "Свободни сме");
  expect(reply.mine).toBe(true); // от гледна точка на вендора
  expect(reply.body).toBe("Свободни сме");
  const detail = await MessagingDAL.for(customer).getThread(threadId);
  const asCustomer = detail.messages.find((m) => m.body === "Свободни сме")!;
  expect(asCustomer.mine).toBe(false); // за клиента вендорското е чуждо
});

test("markRead: маркира само чуждите непрочетени, не пипа моите", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Въпрос" });
  await MessagingDAL.for(vendor).sendMessage(threadId, "Отговор");
  // клиентът чете нишката
  await MessagingDAL.for(customer).markRead(threadId);
  const detail = await MessagingDAL.for(customer).getThread(threadId);
  const mine = detail.messages.find((m) => m.body === "Въпрос")!; // моето
  const theirs = detail.messages.find((m) => m.body === "Отговор")!; // вендорското
  expect(mine.readAt).toBeNull(); // markRead не пипа моите
  expect(theirs.readAt).not.toBeNull(); // чуждото е маркирано
});

test("unreadCount: глобален брой непрочетени от другите към мен", async () => {
  // createInquiry преизползва thread per (listing, customer) — за изолиран brой ползваме нова обява
  const dal = ListingDAL.for(vendor);
  const l2 = await dal.createDraft({ title: "Чат Обява 2", categoryId: await getTestCategoryId(), cityId: await getTestCityId() });
  await dal.submit(l2.id);
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, l2.id));
  const before = await MessagingDAL.for(vendor).unreadCount();
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: l2.id, body: "Ново" });
  const after = await MessagingDAL.for(vendor).unreadCount();
  expect(after).toBe(before + 1);
  await MessagingDAL.for(vendor).markRead(threadId);
  expect(await MessagingDAL.for(vendor).unreadCount()).toBe(before);
});

test("recomputeAvgResponse: vendor reply изчислява avgResponseMinutes", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Кога?" });
  // бекдейтваме thread.createdAt на 30 мин назад, за да е измеримо
  await testDb.execute(sql`update ${schema.thread} set created_at = now() - interval '30 minutes' where id = ${threadId}`);
  await MessagingDAL.for(vendor).sendMessage(threadId, "Ето");
  const [u] = await testDb
    .select({ avg: schema.user.avgResponseMinutes })
    .from(schema.user)
    .where(eq(schema.user.id, vendorId));
  expect(u?.avg).not.toBeNull();
  expect(u!.avg!).toBeGreaterThanOrEqual(25);
  expect(u!.avg!).toBeLessThanOrEqual(35);
});

// поставен последен: vendor sendMessage тук би пренастроил avgResponseMinutes и
// би счупил горния тест, ако се изпълни преди него (recompute осреднява по всички нишки)
test("скрита обява НЕ спира съществуващ чат; но нов createInquiry към нея → NOT_FOUND", async () => {
  const dal = ListingDAL.for(vendor);
  // 3-та published обява: premium лимитът е 2 per категория → друга категория (без значение за чат семантиката)
  const [otherCat] = await testDb
    .select({ id: schema.category.id })
    .from(schema.category)
    .where(ne(schema.category.id, categoryId))
    .limit(1);
  const l3 = await dal.createDraft({ title: "Чат Обява 3", categoryId: otherCat!.id, cityId: await getTestCityId() });
  await dal.submit(l3.id);
  await testDb.update(schema.listing).set({ status: "published", publishedAt: new Date() }).where(eq(schema.listing.id, l3.id));
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: l3.id, body: "Здр" });
  await testDb.update(schema.listing).set({ status: "hidden" }).where(eq(schema.listing.id, l3.id));
  const fromCustomer = await MessagingDAL.for(customer).sendMessage(threadId, "Още сте ли тук?");
  expect(fromCustomer.body).toBe("Още сте ли тук?");
  const fromVendor = await MessagingDAL.for(vendor).sendMessage(threadId, "Да, тук сме");
  expect(fromVendor.body).toBe("Да, тук сме");
  const customer2Data = await createTestUser();
  const customer2: SessionUser = { id: customer2Data.id, email: customer2Data.email, name: "Клиент 2", isAdmin: false };
  await expect(
    MessagingDAL.for(customer2).createInquiry({ listingId: l3.id, body: "Здр" }),
  ).rejects.toThrow("NOT_FOUND");
  await cleanupTestUser(customer2Data.id);
});

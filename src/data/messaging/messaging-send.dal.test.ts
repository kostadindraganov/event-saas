import { afterAll, beforeAll, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestUser, cleanupTestUser, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { MessagingDAL } from "./messaging.dal";
import type { SessionUser } from "@/data/users/require-user";

let customer: SessionUser, vendor: SessionUser;
let customerId: string, vendorId: string;
let publishedId: string;

beforeAll(async () => {
  const c = await createTestUser();
  const v = await createTestUser();
  customerId = c.id; vendorId = v.id;
  customer = { id: c.id, email: c.email, name: "Клиент", isAdmin: false };
  vendor = { id: v.id, email: v.email, name: "Вендор", isAdmin: false };
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(vendor);
  const pub = await dal.createDraft({ title: "Чат Обява", categoryId, cityId });
  await dal.submit(pub.id);
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

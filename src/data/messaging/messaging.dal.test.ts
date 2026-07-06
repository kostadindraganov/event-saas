import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import { user } from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { MessagingDAL } from "./messaging.dal";
import type { SessionUser } from "@/data/users/require-user";

let customer: SessionUser, vendor: SessionUser, stranger: SessionUser;
let customerId: string, vendorId: string, strangerId: string;
let publishedId: string, hiddenId: string;

beforeAll(async () => {
  const c = await createTestUser();
  const v = await createTestUser();
  const s = await createTestUser();
  customerId = c.id; vendorId = v.id; strangerId = s.id;
  customer = { id: c.id, email: c.email, name: "Клиент", isAdmin: false };
  vendor = { id: v.id, email: v.email, name: "Вендор", isAdmin: false };
  stranger = { id: s.id, email: s.email, name: "Външен", isAdmin: false };
  // createTestUser сетва фиксирано име; counterpartName идва от user.name в БД,
  // затова подравняваме БД имената с фикстурата (иначе "Тест Потребител")
  await testDb.update(user).set({ name: "Клиент" }).where(eq(user.id, c.id));
  await testDb.update(user).set({ name: "Вендор" }).where(eq(user.id, v.id));
  await testDb.update(user).set({ name: "Външен" }).where(eq(user.id, s.id));
  // submit() изисква активен план (M2.1 Задача 3); premium → 2 published в категорията
  await createTestSubscription(vendorId, { plan: "premium", status: "active" });
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(vendor);
  const pub = await dal.createDraft({ title: "Запитване Обява", categoryId, cityId });
  await dal.submit(pub.id);
  publishedId = pub.id;
  const hid = await dal.createDraft({ title: "Скрита Запитване", categoryId, cityId });
  await dal.submit(hid.id);
  await dal.hide(hid.id);
  hiddenId = hid.id;
});

afterAll(async () => {
  await cleanupTestUser(customerId);
  await cleanupTestUser(vendorId);
  await cleanupTestUser(strangerId);
});

test("createInquiry към скрита обява → NOT_FOUND", async () => {
  await expect(
    MessagingDAL.for(customer).createInquiry({ listingId: hiddenId, body: "Здр" }),
  ).rejects.toThrow("NOT_FOUND");
});

test("собственик към собствената си обява → FORBIDDEN", async () => {
  await expect(
    MessagingDAL.for(vendor).createInquiry({ listingId: publishedId, body: "Здр" }),
  ).rejects.toThrow("FORBIDDEN");
});

test("createInquiry създава thread + пази eventDate/phone на първото message", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({
    listingId: publishedId, body: "Свободни ли сте?", eventDate: "2026-09-01", phone: "0888123456",
  });
  expect(threadId).toBeTruthy();
  const detail = await MessagingDAL.for(customer).getThread(threadId);
  expect(detail.role).toBe("customer");
  expect(detail.counterpartName).toBe("Вендор");
  expect(detail.messages.length).toBe(1);
  const first = detail.messages[0]!;
  expect(first.mine).toBe(true);
  expect(first.body).toBe("Свободни ли сте?");
  expect(first.eventDate).toBe("2026-09-01");
  expect(first.phone).toBe("0888123456");
  // DTO не издава senderId
  expect(JSON.stringify(detail)).not.toContain(customerId);
});

test("повторен createInquiry → append в СЪЩИЯ thread (eventDate/phone се игнорират)", async () => {
  const dal = MessagingDAL.for(customer);
  const a = await dal.createInquiry({ listingId: publishedId, body: "Първо", eventDate: "2026-09-01" });
  const b = await dal.createInquiry({ listingId: publishedId, body: "Второ", eventDate: "2026-12-25" });
  expect(b.threadId).toBe(a.threadId);
  const detail = await dal.getThread(a.threadId);
  const appended = detail.messages.find((m) => m.body === "Второ")!;
  expect(appended.eventDate).toBeNull(); // append не пренася eventDate
});

test("getThread от не-участник → NOT_FOUND", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Тайно" });
  await expect(MessagingDAL.for(stranger).getThread(threadId)).rejects.toThrow("NOT_FOUND");
});

test("listThreads: клиент вижда нишката като customer, вендор като vendor", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Листвай" });
  const cThreads = await MessagingDAL.for(customer).listThreads();
  const cItem = cThreads.find((t) => t.id === threadId)!;
  expect(cItem.role).toBe("customer");
  expect(cItem.counterpartName).toBe("Вендор");
  expect(cItem.listingTitle).toBe("Запитване Обява");
  const vThreads = await MessagingDAL.for(vendor).listThreads();
  const vItem = vThreads.find((t) => t.id === threadId)!;
  expect(vItem.role).toBe("vendor");
  expect(vItem.counterpartName).toBe("Клиент");
  expect(vItem.unreadCount).toBeGreaterThanOrEqual(1); // клиентското съобщение е непрочетено за вендора
  // външен не вижда нишката
  expect((await MessagingDAL.for(stranger).listThreads()).find((t) => t.id === threadId)).toBeUndefined();
});

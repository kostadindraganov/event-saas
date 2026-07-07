import { afterAll, beforeAll, expect, test, vi } from "vitest";

// email мок хвърля → мутацията трябва да оцелее (fire-and-forget)
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.reject(new Error("boom"))),
  newMessageEmail: vi.fn(() => ({ subject: "s", html: "h" })),
}));

import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId, testDb } from "@/test/db-helpers";
import { listing } from "@/db/schema";
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
  // submit() изисква активен план (M2.1 Задача 3)
  await createTestSubscription(vendorId, { plan: "premium", status: "active" });
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(vendor);
  const pub = await dal.createDraft({ title: "Имейл Обява", categoryId, cityId });
  await dal.submit(pub.id);
  // M2.3: submit() → pending_approval; admin approve() (Задача 5) още не съществува →
  // директен DB update симулира одобрение, за да остане messaging-логиката (изисква published) тестваема.
  await testDb.update(listing).set({ status: "published", publishedAt: new Date() }).where(eq(listing.id, pub.id));
  publishedId = pub.id;
});

afterAll(async () => {
  await cleanupTestUser(customerId);
  await cleanupTestUser(vendorId);
});

test("createInquiry не пада, когато email-ът се провали (fire-and-forget)", async () => {
  const res = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Здр" });
  expect(res.threadId).toBeTruthy();
});

test("sendMessage не пада, когато email-ът се провали", async () => {
  const { threadId } = await MessagingDAL.for(customer).createInquiry({ listingId: publishedId, body: "Пак" });
  const reply = await MessagingDAL.for(vendor).sendMessage(threadId, "Отговор");
  expect(reply.body).toBe("Отговор");
});

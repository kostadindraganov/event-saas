import { randomUUID } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { AccountDAL } from "./account.dal";
import {
  testDb,
  createTestUser,
  cleanupTestUser,
  createTestListing,
  createTestServiceType,
  createTestBooking,
  createTestReview,
  getTestCategoryId,
  getTestCityId,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";

// revalidateTag извън заявка/render хвърля "static generation store missing";
// eraseAccount го вика post-commit — стъбваме (същата конвенция като billing/catalog тестовете).
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

const futureDateStr = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

async function newUser(): Promise<string> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  return u.id;
}

// Обяви + service type за резервации (booking изисква реален listingId/serviceTypeId).
async function bookableListing(
  ownerId: string,
  status: "published" | "draft" = "published",
): Promise<{ listingId: string; serviceTypeId: string }> {
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(ownerId, { status, categoryId, cityId });
  const st = await createTestServiceType(l.id, { kind: "full_day" });
  return { listingId: l.id, serviceTypeId: st.id };
}

test("скрапва PII, задава deletedAt+anonymizedAt, трие session/account", async () => {
  const uid = await newUser();
  await testDb.update(schema.user).set({ phone: "0888", image: "img" }).where(eq(schema.user.id, uid));
  const now = new Date();
  await testDb.insert(schema.session).values({
    id: randomUUID(),
    userId: uid,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 864e5),
    updatedAt: now,
  });
  await testDb.insert(schema.account).values({
    id: randomUUID(),
    userId: uid,
    accountId: uid,
    providerId: "credential",
    updatedAt: now,
  });

  await AccountDAL.eraseAccount(uid);

  const [u] = await testDb.select().from(schema.user).where(eq(schema.user.id, uid));
  expect(u?.name).toBe("Изтрит потребител");
  expect(u?.email).toBe(`deleted+${uid}@deleted.local`);
  expect(u?.phone).toBeNull();
  expect(u?.image).toBeNull();
  expect(u?.emailVerified).toBe(false);
  expect(u?.deletedAt).not.toBeNull();
  expect(u?.anonymizedAt).not.toBeNull();
  expect(await testDb.select().from(schema.session).where(eq(schema.session.userId, uid))).toHaveLength(0);
  expect(await testDb.select().from(schema.account).where(eq(schema.account.userId, uid))).toHaveLength(0);
});

test("блокира при потвърдена предстояща резервация като клиент", async () => {
  const vendor = await newUser();
  const uid = await newUser();
  const { listingId, serviceTypeId } = await bookableListing(vendor);
  await createTestBooking(listingId, serviceTypeId, uid, {
    status: "confirmed",
    isFullDay: true,
    eventDate: futureDateStr(),
    phone: "0888",
  });
  await expect(AccountDAL.eraseAccount(uid)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "HAS_FUTURE_BOOKINGS",
  });
});

test("блокира при потвърдена предстояща резервация на негова обява (вендор)", async () => {
  const vendor = await newUser();
  const customer = await newUser();
  const { listingId, serviceTypeId } = await bookableListing(vendor);
  await createTestBooking(listingId, serviceTypeId, customer, {
    status: "confirmed",
    isFullDay: true,
    eventDate: futureDateStr(),
    phone: "0888",
  });
  await expect(AccountDAL.eraseAccount(vendor)).rejects.toMatchObject({ message: "HAS_FUTURE_BOOKINGS" });
});

test("авто-отменя pending резервациите (като клиент)", async () => {
  const vendor = await newUser();
  const uid = await newUser();
  const { listingId, serviceTypeId } = await bookableListing(vendor);
  const b = await createTestBooking(listingId, serviceTypeId, uid, {
    status: "pending",
    isFullDay: true,
    eventDate: futureDateStr(),
    phone: "0888",
  });
  await AccountDAL.eraseAccount(uid);
  const [row] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, b.id));
  expect(row?.status).toBe("cancelled_by_customer");
  expect(row?.cancelReason).toBe("account_deleted");
  expect(row?.phone).toBe("");
});

test("минава обявите в removed, запазва съдържанието на ревюта", async () => {
  const vendor = await newUser();
  const author = await newUser();
  const { listingId, serviceTypeId } = await bookableListing(vendor, "published");
  // минала completed резервация (не блокира erase) — база за ревюто на насрещната страна
  const b = await createTestBooking(listingId, serviceTypeId, author, {
    status: "completed",
    isFullDay: true,
    eventDate: "2020-01-01",
    phone: "0888",
  });
  const rev = await createTestReview(b.id, listingId, author, { body: "страхотно и достатъчно дълго ревю за валидация" });

  await AccountDAL.eraseAccount(vendor);

  const [l] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, listingId));
  expect(l?.status).toBe("removed");
  const [r] = await testDb.select().from(schema.review).where(eq(schema.review.id, rev.id));
  expect(r?.body).toBe("страхотно и достатъчно дълго ревю за валидация");
});

test("трие verification токените по стария email (PII остатък)", async () => {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  await testDb.insert(schema.verification).values({
    id: randomUUID(),
    identifier: u.email,
    value: "reset-token",
    expiresAt: new Date(Date.now() + 864e5),
    updatedAt: new Date(),
  });

  await AccountDAL.eraseAccount(u.id);

  expect(
    await testDb.select().from(schema.verification).where(eq(schema.verification.identifier, u.email)),
  ).toHaveLength(0);
});

test("втори erase → CONFLICT ALREADY_ANONYMIZED", async () => {
  const uid = await newUser();
  await AccountDAL.eraseAccount(uid);
  await expect(AccountDAL.eraseAccount(uid)).rejects.toMatchObject({ message: "ALREADY_ANONYMIZED" });
});

test("exportData връща всички секции за потребителя", async () => {
  const vendor = await newUser();
  const uid = await newUser();
  const { listingId, serviceTypeId } = await bookableListing(uid);
  await testDb.insert(schema.savedListing).values({ userId: uid, listingId });
  // резервация като клиент (при друг вендор) + резервация като вендор (входяща от друг клиент)
  const { listingId: vendorListingId, serviceTypeId: vendorServiceTypeId } = await bookableListing(vendor);
  await createTestBooking(vendorListingId, vendorServiceTypeId, uid, {
    isFullDay: true,
    eventDate: futureDateStr(),
    phone: "0888",
  });
  const incoming = await createTestBooking(listingId, serviceTypeId, vendor, {
    status: "completed",
    isFullDay: true,
    eventDate: "2020-01-01",
    phone: "0888",
  });
  await createTestReview(incoming.id, listingId, uid, {});

  const dump = await AccountDAL.exportData(uid);

  expect(dump.profile?.email).toContain("@event-review.test");
  expect(dump.saved).toHaveLength(1);
  expect(dump.listings).toHaveLength(1);
  expect(dump.bookingsAsCustomer).toHaveLength(1);
  expect(dump.bookingsAsVendor).toHaveLength(1);
  expect(dump.reviews).toHaveLength(1);
  expect(dump).toHaveProperty("questions");
  expect(dump).toHaveProperty("messages");
  expect(dump).toHaveProperty("subscription");
  expect(dump).toHaveProperty("reports");
});

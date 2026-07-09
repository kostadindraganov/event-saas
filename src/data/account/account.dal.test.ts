import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
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

test("втори erase → CONFLICT ALREADY_ANONYMIZED", async () => {
  const uid = await newUser();
  await AccountDAL.eraseAccount(uid);
  await expect(AccountDAL.eraseAccount(uid)).rejects.toMatchObject({ message: "ALREADY_ANONYMIZED" });
});

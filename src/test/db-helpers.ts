import { randomUUID } from "node:crypto";
import { eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@/db/schema";

// Отделен клиент без "server-only" — тестовете не минават през Next.js
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const testDb = drizzle(pool, { schema });

export async function createTestUser(opts?: { isAdmin?: boolean }) {
  const id = randomUUID();
  const email = `test-${id}@event-review.test`;
  await testDb.insert(schema.user).values({
    id,
    email,
    name: "Тест Потребител",
    emailVerified: false,
    isAdmin: opts?.isAdmin ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, email };
}

export async function createTestSubscription(
  userId: string,
  opts: {
    plan: "standard" | "premium";
    status: "active" | "past_due" | "canceled" | "revoked";
    graceUntil?: Date | null;
  },
) {
  // userId е unique — трий преди повторен insert (тест сменя план/статус на същия owner)
  await testDb.delete(schema.subscription).where(eq(schema.subscription.userId, userId));
  const [row] = await testDb
    .insert(schema.subscription)
    .values({
      userId,
      polarSubscriptionId: `test-${randomUUID()}`,
      plan: opts.plan,
      status: opts.status,
      graceUntil: opts.graceUntil ?? null,
    })
    .returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function createTestPromotion(
  listingId: string,
  opts: {
    source: "premium_included" | "purchased";
    startsAt?: Date;
    endsAt?: Date;
    polarOrderId?: string;
  },
) {
  const now = new Date();
  const [row] = await testDb
    .insert(schema.promotion)
    .values({
      listingId,
      source: opts.source,
      startsAt: opts.startsAt ?? now,
      endsAt: opts.endsAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      polarOrderId: opts.polarOrderId ?? null,
    })
    .returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function createTestListing(
  ownerId: string,
  opts: {
    status: "draft" | "pending_approval" | "published" | "hidden" | "rejected" | "removed";
    categoryId: string;
    cityId: string;
  },
) {
  const id = randomUUID();
  const [row] = await testDb
    .insert(schema.listing)
    .values({
      id,
      ownerId,
      categoryId: opts.categoryId,
      cityId: opts.cityId,
      slug: `test-listing-${id}`,
      title: "Тест Обява",
      status: opts.status,
      publishedAt: opts.status === "published" ? new Date() : null,
    })
    .returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function createTestServiceType(
  listingId: string,
  opts: {
    kind: "full_day" | "hourly";
    name?: string;
    durationMinutes?: number | null;
    priceFromCents?: number | null;
    isActive?: boolean;
  },
) {
  const [row] = await testDb
    .insert(schema.bookingServiceType)
    .values({
      listingId,
      kind: opts.kind,
      name: opts.name ?? "Тест Услуга",
      durationMinutes: opts.durationMinutes ?? (opts.kind === "hourly" ? 60 : null),
      priceFromCents: opts.priceFromCents ?? null,
      isActive: opts.isActive ?? true,
    })
    .returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function createTestAvailability(
  listingId: string,
  opts: { weekday: number; startTime: string; endTime: string },
) {
  const [row] = await testDb
    .insert(schema.availabilityRule)
    .values({ listingId, weekday: opts.weekday, startTime: opts.startTime, endTime: opts.endTime })
    .returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function createTestBooking(
  listingId: string,
  serviceTypeId: string,
  customerId: string,
  opts: {
    status?: "pending" | "confirmed" | "declined" | "auto_declined" | "completed" | "cancelled_by_customer" | "cancelled_by_vendor";
    isFullDay: boolean;
    eventDate: string;
    startTime?: string | null;
    endTime?: string | null;
    phone: string;
    message?: string | null;
  },
) {
  const [row] = await testDb
    .insert(schema.booking)
    .values({
      listingId,
      serviceTypeId,
      customerId,
      status: opts.status ?? "pending",
      isFullDay: opts.isFullDay,
      eventDate: opts.eventDate,
      startTime: opts.startTime ?? null,
      endTime: opts.endTime ?? null,
      phone: opts.phone,
      message: opts.message ?? null,
    })
    .returning();
  if (!row) throw new Error("INSERT_FAILED");
  return row;
}

export async function cleanupTestUser(userId: string) {
  // thread FK-тата (customerId/vendorId) са no-action → трий нишките първо (message каскадира от thread)
  await testDb.delete(schema.thread).where(
    or(eq(schema.thread.vendorId, userId), eq(schema.thread.customerId, userId)),
  );
  // subscription.userId FK → user.id е no-action; трий преди user
  await testDb.delete(schema.subscription).where(eq(schema.subscription.userId, userId));
  // promotion каскадира от listing (onDelete: cascade) — explicit delete тук за симетрия/яснота,
  // не заради нужда (виж catalog.ts promotion FK), преди самото изтриване на listing.
  const ownListingIds = testDb
    .select({ id: schema.listing.id })
    .from(schema.listing)
    .where(eq(schema.listing.ownerId, userId));
  await testDb.delete(schema.promotion).where(inArray(schema.promotion.listingId, ownListingIds));
  // booking.listingId/serviceTypeId/customerId са no-action (без cascade) → трий ПРЕДИ listing/user.
  // bookingServiceType/availabilityRule/blockedDate каскадират сами при delete на listing по-долу.
  await testDb.delete(schema.booking).where(
    or(inArray(schema.booking.listingId, ownListingIds), eq(schema.booking.customerId, userId)),
  );
  // обявите каскадират децата си; savedListing.userId има onDelete cascade → авто при delete user
  await testDb.delete(schema.listing).where(eq(schema.listing.ownerId, userId));
  await testDb.delete(schema.user).where(eq(schema.user.id, userId));
}

export async function getTestCategoryId(): Promise<string> {
  const [row] = await testDb.select({ id: schema.category.id }).from(schema.category).limit(1);
  if (!row) throw new Error("seed липсва: category");
  return row.id;
}

export async function getTestCityId(): Promise<string> {
  const [row] = await testDb.select({ id: schema.city.id }).from(schema.city).limit(1);
  if (!row) throw new Error("seed липсва: city");
  return row.id;
}

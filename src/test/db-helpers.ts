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

export async function createTestUser() {
  const id = randomUUID();
  const email = `test-${id}@event-review.test`;
  await testDb.insert(schema.user).values({
    id,
    email,
    name: "Тест Потребител",
    emailVerified: false,
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

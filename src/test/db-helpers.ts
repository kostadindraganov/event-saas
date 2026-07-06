import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
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

export async function cleanupTestUser(userId: string) {
  // thread FK-тата (customerId/vendorId) са no-action → трий нишките първо (message каскадира от thread)
  await testDb.delete(schema.thread).where(
    or(eq(schema.thread.vendorId, userId), eq(schema.thread.customerId, userId)),
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

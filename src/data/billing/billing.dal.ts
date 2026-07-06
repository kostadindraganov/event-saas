import "server-only";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { listing, setting, subscription } from "@/db/schema";

// типът на tx вътре в db.transaction(async (tx) => ...) — преизползва се от submit()/unhide() (Задача 3)
// и от разширенията в Задачи 5/7/8. Каноничното име е `Transaction`.
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BillingSettings = {
  limits: { standard: number; premiumPerCategory: number };
  graceDays: number;
};

const DEFAULT_SETTINGS: BillingSettings = {
  limits: { standard: 1, premiumPerCategory: 2 },
  graceDays: 7,
};

// ponytail: четено извън транзакцията — лимитите почти никога не се сменят,
// консистентност с count-а в submit()/unhide() транзакцията не носи полза тук.
export async function getBillingSettings(): Promise<BillingSettings> {
  const rows = await db
    .select()
    .from(setting)
    .where(inArray(setting.key, ["billing.limits", "billing.graceDays"]));
  const limits = rows.find((r) => r.key === "billing.limits")?.value as BillingSettings["limits"] | undefined;
  const graceDays = rows.find((r) => r.key === "billing.graceDays")?.value as number | undefined;
  return {
    limits: limits ?? DEFAULT_SETTINGS.limits,
    graceDays: graceDays ?? DEFAULT_SETTINGS.graceDays,
  };
}

async function countOwnerPublished(
  tx: Transaction,
  userId: string,
  excludeListingId: string,
  categoryId?: string,
): Promise<number> {
  const conditions = [
    eq(listing.ownerId, userId),
    eq(listing.status, "published"),
    ne(listing.id, excludeListingId),
  ];
  if (categoryId) conditions.push(eq(listing.categoryId, categoryId));
  const [row] = await tx.select({ n: count() }).from(listing).where(and(...conditions));
  return row?.n ?? 0;
}

export class BillingDAL {
  // Вика се вътре в submit()/unhide() транзакцията (tx), ПРЕДИ CAS UPDATE-а на listing.status.
  // Standard = общо 1 published (без значение от categoryId); Premium = 2 per categoryId.
  // excludeListingId маха обявата, която тъкмо се публикува, от собственото ѝ броене.
  static async assertCanPublish(
    tx: Transaction,
    userId: string,
    categoryId: string,
    excludeListingId: string,
  ): Promise<void> {
    const [sub] = await tx.select().from(subscription).where(eq(subscription.userId, userId));
    const now = Date.now();
    const active = !!sub && (
      sub.status === "active" ||
      (sub.status === "past_due" && !!sub.graceUntil && sub.graceUntil.getTime() > now)
    );
    if (!sub || !active) throw new TRPCError({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });

    const { limits } = await getBillingSettings();
    const n = sub.plan === "standard"
      ? await countOwnerPublished(tx, userId, excludeListingId)
      : await countOwnerPublished(tx, userId, excludeListingId, categoryId);
    const limit = sub.plan === "standard" ? limits.standard : limits.premiumPerCategory;
    if (n >= limit) throw new TRPCError({ code: "FORBIDDEN", message: "LIMIT_REACHED" });
  }
}

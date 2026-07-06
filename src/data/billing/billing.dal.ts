import "server-only";
import { and, count, eq, inArray, lt, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { listing, setting, subscription, user } from "@/db/schema";
import { listingsHiddenEmail, sendEmail, subscriptionPastDueEmail } from "@/lib/email";

// Тесен локален тип: точната форма на Polar webhook payload-а не е потвърдена в код —
// пазим само полетата, които реално ползваме, и парсваме defensively.
export type PolarSubscriptionEventPayload = {
  customer: { externalId: string | null } | null;
  data: {
    id: string;
    status: string;
    currentPeriodEnd: string | Date | null;
    productId: string;
  };
};

function mapStatus(s: string): "active" | "past_due" | "canceled" | "revoked" | null {
  switch (s) {
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled": return "canceled";
    case "revoked": return "revoked";
    default: return null; // непознат Polar status (напр. trialing) — игнорирай defensively
  }
}

function mapPlan(productId: string): "standard" | "premium" | null {
  if (productId === process.env.POLAR_PRODUCT_STANDARD_MONTHLY || productId === process.env.POLAR_PRODUCT_STANDARD_YEARLY) {
    return "standard";
  }
  if (productId === process.env.POLAR_PRODUCT_PREMIUM_MONTHLY || productId === process.env.POLAR_PRODUCT_PREMIUM_YEARLY) {
    return "premium";
  }
  return null;
}

// Общ helper: скрива ВСИЧКИ published обяви на потребителя (системно, hiddenBySystem=true).
// Ползва се от projectSubscriptionEvent (revoked/downgrade) И от cron expireGracePeriods (Задача 7).
export async function hideAllPublished(tx: Transaction, userId: string): Promise<number> {
  const rows = await tx
    .update(listing)
    .set({ status: "hidden", hiddenBySystem: true, updatedAt: new Date() })
    .where(and(eq(listing.ownerId, userId), eq(listing.status, "published")))
    .returning({ id: listing.id });
  return rows.length;
}

async function countPublished(tx: Transaction, userId: string): Promise<number> {
  const rows = await tx
    .select({ id: listing.id })
    .from(listing)
    .where(and(eq(listing.ownerId, userId), eq(listing.status, "published")));
  return rows.length;
}

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

// fire-and-forget: чете email от user; НИКОГА не бута webhook проекцията
async function notifyPastDueEmail(userId: string, graceUntil: Date | null): Promise<void> {
  if (!graceUntil) return;
  const [row] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId));
  if (!row?.email) return;
  const { subject, html } = subscriptionPastDueEmail({ graceUntil });
  await sendEmail({ to: row.email, subject, html });
}

// export: и Задача 7 cron (expireGracePeriods) я ползва за скрити-по-изтичане-на-гратис
export async function notifyListingsHiddenEmail(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  const [row] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, userId));
  if (!row?.email) return;
  const { subject, html } = listingsHiddenEmail({ count });
  await sendEmail({ to: row.email, subject, html });
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

  // Идемпотентна проекция на Polar subscription webhook → subscription ред (upsert по userId).
  // Викана от auth.ts webhook handler-ите; те гълтат грешки (Polar retry loop).
  static async projectSubscriptionEvent(payload: PolarSubscriptionEventPayload): Promise<void> {
    const userId = payload.customer?.externalId;
    if (!userId) {
      console.error("Polar webhook: липсва customer.externalId", payload.data.id);
      return;
    }
    const status = mapStatus(payload.data.status);
    const plan = mapPlan(payload.data.productId);
    if (!status || !plan) {
      console.error("Polar webhook: непознат status/productId", payload.data);
      return;
    }

    const { graceDays, limits } = await getBillingSettings();
    const currentPeriodEnd = payload.data.currentPeriodEnd ? new Date(payload.data.currentPeriodEnd) : null;

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: subscription.status, plan: subscription.plan, graceUntil: subscription.graceUntil })
        .from(subscription)
        .where(eq(subscription.userId, userId));

      const graceUntil =
        status === "active"
          ? null
          : status === "past_due"
            ? (existing?.graceUntil ?? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000))
            : (existing?.graceUntil ?? null);

      await tx
        .insert(subscription)
        .values({ userId, polarSubscriptionId: payload.data.id, plan, status, currentPeriodEnd, graceUntil })
        .onConflictDoUpdate({
          target: subscription.userId,
          set: { polarSubscriptionId: payload.data.id, plan, status, currentPeriodEnd, graceUntil, updatedAt: new Date() },
        });

      let hiddenCount = 0;
      if (status === "revoked") {
        hiddenCount = await hideAllPublished(tx, userId);
      } else if (plan === "standard" && existing?.plan === "premium") {
        const published = await countPublished(tx, userId);
        if (published > limits.standard) hiddenCount = await hideAllPublished(tx, userId);
      }

      const isNewPastDue = status === "past_due" && existing?.status !== "past_due";
      return { isNewPastDue, hiddenCount, graceUntil };
    });

    // fire-and-forget email-и СЛЕД транзакцията; никога не бутат обработката на webhook-а
    if (result.isNewPastDue) {
      void notifyPastDueEmail(userId, result.graceUntil).catch((e) => console.error("email failed", e));
    }
    if (result.hiddenCount > 0) {
      void notifyListingsHiddenEmail(userId, result.hiddenCount).catch((e) => console.error("email failed", e));
    }
  }

  // Cron: изтекъл гратис (past_due + graceUntil < now) → скрива published обявите на потребителя.
  // Идемпотентно (hideAllPublished филтрира WHERE status='published'); грешка на един потребител
  // не блокира batch-а (отделна транзакция per-user).
  static async expireGracePeriods(): Promise<{ hidden: number; users: string[] }> {
    const now = new Date();
    const expired = await db
      .select({ userId: subscription.userId })
      .from(subscription)
      .where(and(eq(subscription.status, "past_due"), lt(subscription.graceUntil, now)));

    let hidden = 0;
    const users: string[] = [];
    for (const { userId } of expired) {
      try {
        const count = await db.transaction((tx) => hideAllPublished(tx, userId));
        if (count > 0) {
          hidden += count;
          users.push(userId);
          void notifyListingsHiddenEmail(userId, count).catch((e) => console.error("email failed", e));
        }
      } catch (e) {
        console.error("expireGracePeriods: fail за user", userId, e); // грешка на един не убива batch-а
      }
    }
    return { hidden, users };
  }
}

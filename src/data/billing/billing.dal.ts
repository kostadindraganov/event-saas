import "server-only";
import { revalidateTag } from "next/cache";
import { and, count, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { category, listing, promotion, setting, subscription, user } from "@/db/schema";
import { BillingSettingsSchema } from "@/data/admin/admin.dto";
import { LISTING_TRANSITIONS } from "@/data/catalog/catalog.policy";
import { listingsHiddenEmail, sendEmail, subscriptionPastDueEmail } from "@/lib/email";
import type { SessionUser } from "@/data/users/require-user";
import type {
  BillingOverviewDTO, MyPromotionListingDTO, PolarOrderPaidPayload, PolarSubscriptionEventPayload,
  SubscriptionDTO, SystemHiddenListingDTO,
} from "./billing.dto";

// Единствената дефиниция на «Доставчик» (CONTEXT.md): User с активен абонамент = active,
// или past_due в текущ гратисен прозорец. Cron-ът expireGracePeriods е отрицанието ѝ за past_due.
export function isActiveForPublishing(
  sub: { status: string; graceUntil: Date | null } | undefined | null,
  now: Date = new Date(),
): boolean {
  if (!sub) return false;
  return sub.status === "active" ||
    (sub.status === "past_due" && sub.graceUntil !== null && sub.graceUntil > now);
}

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
    .set({ status: LISTING_TRANSITIONS.hide.to, hiddenBySystem: true, updatedAt: new Date() })
    .where(and(eq(listing.ownerId, userId), inArray(listing.status, LISTING_TRANSITIONS.hide.from)))
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
  promo: { durationDays: number; premiumSlots: number; carouselSize: number };
};

const DEFAULT_SETTINGS: BillingSettings = {
  limits: { standard: 1, premiumPerCategory: 2 },
  graceDays: 7,
  promo: { durationDays: 30, premiumSlots: 2, carouselSize: 8 },
};

// ponytail: четено извън транзакцията — лимитите почти никога не се сменят,
// консистентност с count-а в submit()/unhide() транзакцията не носи полза тук.
export async function getBillingSettings(): Promise<BillingSettings> {
  const rows = await db
    .select()
    .from(setting)
    .where(inArray(setting.key, ["billing.limits", "billing.graceDays", "billing.promo"]));
  const limits = BillingSettingsSchema.shape.limits.safeParse(rows.find((r) => r.key === "billing.limits")?.value);
  const graceDays = BillingSettingsSchema.shape.graceDays.safeParse(rows.find((r) => r.key === "billing.graceDays")?.value);
  const promo = BillingSettingsSchema.shape.promo.safeParse(rows.find((r) => r.key === "billing.promo")?.value);
  return {
    limits: limits.success ? limits.data : DEFAULT_SETTINGS.limits,
    graceDays: graceDays.success ? graceDays.data : DEFAULT_SETTINGS.graceDays,
    promo: promo.success ? promo.data : DEFAULT_SETTINGS.promo,
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
  // конструктор + фабрика — mine/restoreListings/keepListing ползват this.user.
  // (static assertCanPublish/projectSubscriptionEvent/expireGracePeriods остават непроменени)
  private constructor(private readonly user: SessionUser) {}
  static for(user: SessionUser): BillingDAL {
    return new BillingDAL(user);
  }

  async mine(locale: "bg" | "en"): Promise<BillingOverviewDTO> {
    const [subRow] = await db.select().from(subscription).where(eq(subscription.userId, this.user.id));
    const hiddenRows = await db
      .select({
        id: listing.id,
        title: listing.title,
        categoryNameBg: category.nameBg,
        categoryNameEn: category.nameEn,
      })
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .where(and(
        eq(listing.ownerId, this.user.id),
        eq(listing.status, "hidden"),
        eq(listing.hiddenBySystem, true),
      ));
    const sub: SubscriptionDTO | null = subRow ? {
      plan: subRow.plan,
      status: subRow.status,
      currentPeriodEnd: subRow.currentPeriodEnd?.toISOString() ?? null,
      graceUntil: subRow.graceUntil?.toISOString() ?? null,
    } : null;
    const systemHidden: SystemHiddenListingDTO[] = hiddenRows.map((r) => ({
      id: r.id,
      title: r.title,
      categoryName: locale === "bg" ? r.categoryNameBg : r.categoryNameEn,
    }));
    return { subscription: sub, systemHidden };
  }

  async restoreListings(): Promise<{ restored: number }> {
    const userId = this.user.id;
    return db.transaction(async (tx) => {
      const [subRow] = await tx.select().from(subscription).where(eq(subscription.userId, userId));
      if (!isActiveForPublishing(subRow)) throw new TRPCError({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });

      const hiddenRows = await tx
        .select({ id: listing.id, categoryId: listing.categoryId })
        .from(listing)
        .where(and(eq(listing.ownerId, userId), eq(listing.status, "hidden"), eq(listing.hiddenBySystem, true)));
      if (hiddenRows.length === 0) return { restored: 0 };

      const publishedByCategory = await tx
        .select({ categoryId: listing.categoryId, n: count() })
        .from(listing)
        .where(and(eq(listing.ownerId, userId), eq(listing.status, "published")))
        .groupBy(listing.categoryId);

      const { limits: { standard, premiumPerCategory } } = await getBillingSettings();
      if (subRow!.plan === "standard") {
        const publishedTotal = publishedByCategory.reduce((sum, r) => sum + r.n, 0);
        if (publishedTotal + hiddenRows.length > standard) {
          throw new TRPCError({ code: "FORBIDDEN", message: "LIMIT_REACHED" });
        }
      } else {
        const publishedMap = new Map(publishedByCategory.map((r) => [r.categoryId, r.n]));
        const hiddenByCategory = new Map<string, number>();
        for (const r of hiddenRows) hiddenByCategory.set(r.categoryId, (hiddenByCategory.get(r.categoryId) ?? 0) + 1);
        for (const [catId, hiddenCount] of hiddenByCategory) {
          const already = publishedMap.get(catId) ?? 0;
          if (already + hiddenCount > premiumPerCategory) {
            throw new TRPCError({ code: "FORBIDDEN", message: "LIMIT_REACHED" });
          }
        }
      }

      const ids = hiddenRows.map((r) => r.id);
      await tx.update(listing)
        .set({ status: LISTING_TRANSITIONS.unhide.to, hiddenBySystem: false, publishedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(listing.ownerId, userId),
          inArray(listing.id, ids),
          inArray(listing.status, LISTING_TRANSITIONS.unhide.from),
          eq(listing.hiddenBySystem, true),
        ));
      return { restored: ids.length };
    });
  }

  async keepListing(listingId: string): Promise<void> {
    const userId = this.user.id;
    await db.transaction(async (tx) => {
      // планът гейтва семантиката: same select като restoreListings; без активен ред → NO_SUBSCRIPTION
      const [subRow] = await tx.select().from(subscription).where(eq(subscription.userId, userId));
      if (!isActiveForPublishing(subRow)) throw new TRPCError({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });

      const [row] = await tx.select().from(listing).where(eq(listing.id, listingId));
      // чужда обява ИЛИ не е system-hidden → NOT_FOUND, никога FORBIDDEN (без enumeration, contract т.7)
      if (!row || row.ownerId !== userId || row.status !== "hidden" || !row.hiddenBySystem) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (subRow!.plan === "standard") {
        // picker semantics ("избери коя 1 остава"): скрий всички ДРУГИ published сестри,
        // после публикувай избраната — след hide-а published=0, entitlement е тривиален (без assertCanPublish).
        await tx.update(listing)
          .set({ status: LISTING_TRANSITIONS.hide.to, hiddenBySystem: true, updatedAt: new Date() })
          .where(and(eq(listing.ownerId, userId), ne(listing.id, listingId), inArray(listing.status, LISTING_TRANSITIONS.hide.from)));
      } else {
        // premium: НИКАКЪВ sibling hide (чужди категории са легитимни) — само per-category entitlement
        await BillingDAL.assertCanPublish(tx, userId, row.categoryId, listingId);
      }

      await tx.update(listing)
        .set({ status: LISTING_TRANSITIONS.unhide.to, hiddenBySystem: false, publishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(listing.id, listingId), inArray(listing.status, LISTING_TRANSITIONS.unhide.from)));
    });
  }

  // Premium: активира включен промо слот за собствена обява. Валидационен ред (contract т.4):
  // NOT_FOUND (чужда/несъществуваща) → NO_SUBSCRIPTION/PREMIUM_REQUIRED → LIMIT_REACHED → ALREADY_PROMOTED.
  async activate(listingId: string): Promise<void> {
    const userId = this.user.id;
    const { promo } = await getBillingSettings();
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ ownerId: listing.ownerId }).from(listing).where(eq(listing.id, listingId));
      if (!row || row.ownerId !== userId) throw new TRPCError({ code: "NOT_FOUND" });

      const [sub] = await tx.select().from(subscription).where(eq(subscription.userId, userId));
      if (!sub || !isActiveForPublishing(sub)) throw new TRPCError({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });
      if (sub.plan !== "premium") throw new TRPCError({ code: "FORBIDDEN", message: "PREMIUM_REQUIRED" });

      const usedSlots = await BillingDAL.countActiveIncludedPromotions(tx, userId);
      if (usedSlots >= promo.premiumSlots) throw new TRPCError({ code: "FORBIDDEN", message: "LIMIT_REACHED" });

      if (await BillingDAL.activePromotionForListing(tx, listingId)) {
        throw new TRPCError({ code: "CONFLICT", message: "ALREADY_PROMOTED" });
      }

      const now = new Date();
      await tx.insert(promotion).values({
        listingId,
        source: "premium_included",
        startsAt: now,
        endsAt: new Date(now.getTime() + promo.durationDays * 24 * 60 * 60 * 1000),
      });
    });
  }

  // PromotionManager данни: published+hidden обяви на owner-а + активна промоция (ако има).
  async myPromotions(locale: "bg" | "en"): Promise<MyPromotionListingDTO[]> {
    const now = new Date();
    const rows = await db
      .select({
        id: listing.id,
        title: listing.title,
        categoryNameBg: category.nameBg,
        categoryNameEn: category.nameEn,
        status: listing.status,
        promoEndsAt: promotion.endsAt,
      })
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .leftJoin(promotion, and(
        eq(promotion.listingId, listing.id),
        lte(promotion.startsAt, now),
        gt(promotion.endsAt, now),
      ))
      .where(and(eq(listing.ownerId, this.user.id), inArray(listing.status, ["published", "hidden"])));

    const byListing = new Map<string, MyPromotionListingDTO>();
    for (const r of rows) {
      if (!byListing.has(r.id)) {
        byListing.set(r.id, {
          id: r.id,
          title: r.title,
          categoryName: locale === "bg" ? r.categoryNameBg : r.categoryNameEn,
          status: r.status as "published" | "hidden",
          promoActive: false,
          promoEndsAt: null,
        });
      }
      if (r.promoEndsAt) {
        const dto = byListing.get(r.id)!;
        dto.promoActive = true;
        dto.promoEndsAt = r.promoEndsAt.toISOString();
      }
    }
    return Array.from(byListing.values());
  }

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
    if (!sub || !isActiveForPublishing(sub)) throw new TRPCError({ code: "FORBIDDEN", message: "NO_SUBSCRIPTION" });

    const { limits } = await getBillingSettings();
    const n = sub.plan === "standard"
      ? await countOwnerPublished(tx, userId, excludeListingId)
      : await countOwnerPublished(tx, userId, excludeListingId, categoryId);
    const limit = sub.plan === "standard" ? limits.standard : limits.premiumPerCategory;
    if (n >= limit) throw new TRPCError({ code: "FORBIDDEN", message: "LIMIT_REACHED" });
  }

  // Guard за «една активна промоция per обява» (contract решение #2) — активен прозорец startsAt<=now<endsAt.
  // Ползва се от activate() (Задача 4) и projectOrderEvent() (Задача 3), винаги вътре в транзакция.
  static async activePromotionForListing(tx: Transaction, listingId: string): Promise<boolean> {
    const now = new Date();
    const [row] = await tx
      .select({ id: promotion.id })
      .from(promotion)
      .where(and(eq(promotion.listingId, listingId), lte(promotion.startsAt, now), gt(promotion.endsAt, now)));
    return !!row;
  }

  // Брой активни 'premium_included' промоции на owner-а — за premiumSlots лимита в activate() (Задача 4).
  static async countActiveIncludedPromotions(tx: Transaction, userId: string): Promise<number> {
    const now = new Date();
    const [row] = await tx
      .select({ n: count() })
      .from(promotion)
      .innerJoin(listing, eq(promotion.listingId, listing.id))
      .where(and(
        eq(listing.ownerId, userId),
        eq(promotion.source, "premium_included"),
        lte(promotion.startsAt, now),
        gt(promotion.endsAt, now),
      ));
    return row?.n ?? 0;
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

  // Идемпотентна проекция на Polar onOrderPaid webhook → promotion ред (insert по polarOrderId).
  // Викана от auth.ts (handleOrderPaidEvent); гълта всичко бизнес-логично (log+skip), никога не хвърля
  // към webhook route-а (Polar retry loop правилото от M2.1).
  static async projectOrderEvent(payload: PolarOrderPaidPayload): Promise<void> {
    if (payload.data.productId !== process.env.POLAR_PRODUCT_PROMOTION) {
      return; // друг продукт (subscription one-time сценарий не съществува тук) — ignore
    }
    const userId = payload.customer?.externalId ?? null;
    const referenceId = payload.data.metadata?.referenceId;
    const listingId = typeof referenceId === "string" ? referenceId : null;
    if (!userId || !listingId) {
      console.error("Polar order webhook: липсва customer.externalId/metadata.referenceId", payload.data.id);
      return;
    }

    const { promo } = await getBillingSettings();

    const inserted = await db.transaction(async (tx) => {
      const [byOrder] = await tx
        .select({ id: promotion.id })
        .from(promotion)
        .where(eq(promotion.polarOrderId, payload.data.id));
      if (byOrder) return false; // идемпотентност: order вече проектиран

      const [row] = await tx.select({ ownerId: listing.ownerId }).from(listing).where(eq(listing.id, listingId));
      if (!row || row.ownerId !== userId) {
        console.error("Polar order webhook: непозната/чужда обява за поръчка", payload.data.id, listingId);
        return false;
      }

      if (await BillingDAL.activePromotionForListing(tx, listingId)) {
        console.error("Polar order webhook: обявата вече е промотирана", listingId);
        return false;
      }

      const now = new Date();
      await tx.insert(promotion).values({
        listingId,
        source: "purchased",
        polarOrderId: payload.data.id,
        startsAt: now,
        endsAt: new Date(now.getTime() + promo.durationDays * 24 * 60 * 60 * 1000),
      });
      return true;
    });

    if (inserted) revalidateTag("listings", { expire: 0 });
  }

  // Cron: изтекъл гратис (past_due + graceUntil < now) → скрива published обявите на потребителя.
  // Идемпотентно (hideAllPublished филтрира WHERE status='published'); грешка на един потребител
  // не блокира batch-а (отделна транзакция per-user).
  static async expireGracePeriods(): Promise<{ hidden: number; users: string[] }> {
    const now = new Date();
    // изтекъл = past_due, който вече НЕ е isActiveForPublishing (същата дефиниция, не отделен SQL израз)
    const pastDue = await db
      .select({ userId: subscription.userId, status: subscription.status, graceUntil: subscription.graceUntil })
      .from(subscription)
      .where(eq(subscription.status, "past_due"));
    const expired = pastDue.filter((s) => !isActiveForPublishing(s, now));

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

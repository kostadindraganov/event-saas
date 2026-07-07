import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { category, city, listing, session, setting, user } from "@/db/schema";
import { BillingDAL, getBillingSettings, type BillingSettings } from "@/data/billing/billing.dal";
import { listingApprovedEmail, listingRejectedEmail, sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/seo";
import type { AdminListingRowDTO, AdminUserDTO, BillingSettingsInput } from "./admin.dto";

// fire-and-forget: чете email от user; огледален на billing.dal.ts:124-139 (never-throw в caller-а)
async function notifyListingApproved(userId: string, listingTitle: string, slug: string): Promise<void> {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!row?.email) return;
  const { subject, html } = listingApprovedEmail({ listingTitle, listingUrl: `${getBaseUrl()}/obiava/${slug}` });
  await sendEmail({ to: row.email, subject, html });
}

async function notifyListingRejected(userId: string, listingTitle: string, reason: string, listingId: string): Promise<void> {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!row?.email) return;
  const { subject, html } = listingRejectedEmail({
    listingTitle,
    reason,
    editUrl: `${getBaseUrl()}/profil/dostavchik/obiavi/${listingId}`,
  });
  await sendEmail({ to: row.email, subject, html });
}

export class AdminDAL {
  // adminProcedure вече гарантира admin → чисти static методи, без for(user) фабрика.

  static async listListings({ status }: { status: "pending_approval" | "published" }): Promise<AdminListingRowDTO[]> {
    const rows = await db
      .select({
        id: listing.id,
        title: listing.title,
        status: listing.status,
        categoryNameBg: category.nameBg,
        categoryNameEn: category.nameEn,
        cityName: city.name,
        ownerName: user.name,
        ownerEmail: user.email,
        createdAt: listing.createdAt,
        rejectionReason: listing.rejectionReason,
      })
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .innerJoin(user, eq(listing.ownerId, user.id))
      .where(eq(listing.status, status))
      .orderBy(desc(listing.createdAt));
    // status е стеснен от WHERE-а към param-а; overriding-ва широкия listing.status enum (noUncheckedIndexedAccess narrowing gap)
    return rows.map((r) => ({ ...r, status, createdAt: r.createdAt.toISOString() }));
  }

  // pending_approval → published. Entitlement е АВТОРИТЕТЕН тук (единственият преход, който
  // консумира лимита) — assertCanPublish ВЪТРЕ в tx, ПРЕДИ CAS. Провал → tx rollback, обявата
  // остава pending, грешката бълбука към админа (без auto-reject).
  static async approve(id: string): Promise<{ slug: string; status: string }> {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          ownerId: listing.ownerId,
          categoryId: listing.categoryId,
          status: listing.status,
        })
        .from(listing)
        .where(eq(listing.id, id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "pending_approval") throw new TRPCError({ code: "CONFLICT", message: "NOT_PENDING" });

      await BillingDAL.assertCanPublish(tx, row.ownerId, row.categoryId, id);

      const [updated] = await tx
        .update(listing)
        .set({
          status: "published",
          publishedAt: new Date(),
          rejectionReason: null,
          hiddenBySystem: false,
          updatedAt: new Date(),
        })
        .where(and(eq(listing.id, id), eq(listing.status, "pending_approval")))
        .returning({ ownerId: listing.ownerId, title: listing.title, slug: listing.slug, status: listing.status });
      if (!updated) throw new TRPCError({ code: "CONFLICT" }); // CAS изгубена — конкурентен преход
      return updated;
    });
    void notifyListingApproved(result.ownerId, result.title, result.slug).catch((e) => console.error("email failed", e));
    return { slug: result.slug, status: result.status };
  }

  // pending_approval → rejected + причина. Единичен CAS (WHERE status='pending_approval') — без tx.
  static async reject(id: string, reason: string): Promise<{ slug: string; status: string }> {
    const [updated] = await db
      .update(listing)
      .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
      .where(and(eq(listing.id, id), eq(listing.status, "pending_approval")))
      .returning({ ownerId: listing.ownerId, title: listing.title, slug: listing.slug, status: listing.status });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    void notifyListingRejected(updated.ownerId, updated.title, reason, id).catch((e) => console.error("email failed", e));
    return { slug: updated.slug, status: updated.status };
  }

  // Admin takedown: published|hidden → removed. БЕЗ owner филтър (админ действа върху чужди обяви).
  static async remove(id: string): Promise<{ slug: string; status: string }> {
    const [updated] = await db
      .update(listing)
      .set({ status: "removed", updatedAt: new Date() })
      .where(and(eq(listing.id, id), inArray(listing.status, ["published", "hidden"])))
      .returning({ slug: listing.slug, status: listing.status });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    return { slug: updated.slug, status: updated.status };
  }

  static async listUsers(): Promise<AdminUserDTO[]> {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        deletedAt: user.deletedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      isAdmin: r.isAdmin ?? false,
      createdAt: r.createdAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    }));
  }

  // Блокиране = soft-delete (deletedAt) + инвалидация на живите сесии. Enforcement-ът е в
  // getCurrentUser (единствен choke-point). Self-guard: админ не блокира себе си.
  static async blockUser(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw new TRPCError({ code: "FORBIDDEN", message: "SELF_ACTION" });
    await db.transaction(async (tx) => {
      await tx.update(user).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(user.id, targetId));
      await tx.delete(session).where(eq(session.userId, targetId));
    });
  }

  static async unblockUser(targetId: string): Promise<void> {
    await db.update(user).set({ deletedAt: null, updatedAt: new Date() }).where(eq(user.id, targetId));
  }

  // Self-guard: админ не де-админва (нито промотира) себе си — предпазва от заключване извън панела.
  static async setAdmin(actorId: string, targetId: string, value: boolean): Promise<void> {
    if (actorId === targetId) throw new TRPCError({ code: "FORBIDDEN", message: "SELF_ACTION" });
    await db.update(user).set({ isAdmin: value, updatedAt: new Date() }).where(eq(user.id, targetId));
  }

  static getSettings(): Promise<BillingSettings> {
    return getBillingSettings();
  }

  // Per-ключ upsert (target=setting.key). getBillingSettings чете некеширано → важи веднага.
  static async updateSettings(input: BillingSettingsInput): Promise<BillingSettings> {
    await db.transaction(async (tx) => {
      await tx.insert(setting).values({ key: "billing.limits", value: input.limits })
        .onConflictDoUpdate({ target: setting.key, set: { value: input.limits } });
      await tx.insert(setting).values({ key: "billing.graceDays", value: input.graceDays })
        .onConflictDoUpdate({ target: setting.key, set: { value: input.graceDays } });
      await tx.insert(setting).values({ key: "billing.promo", value: input.promo })
        .onConflictDoUpdate({ target: setting.key, set: { value: input.promo } });
    });
    return getBillingSettings();
  }
}

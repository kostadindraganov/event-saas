import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { category, city, listing, user } from "@/db/schema";
import { BillingDAL } from "@/data/billing/billing.dal";
import { listingApprovedEmail, listingRejectedEmail, sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/seo";
import type { AdminListingRowDTO } from "./admin.dto";

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
}

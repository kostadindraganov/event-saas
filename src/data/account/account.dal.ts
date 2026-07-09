import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { user, session, account, verification } from "@/db/schema/auth";
import { booking } from "@/db/schema/booking";
import { listing, savedListing } from "@/db/schema/catalog";
import { thread, message } from "@/db/schema/messaging";
import { review, question, report } from "@/db/schema/reviews";
import { subscription } from "@/db/schema/billing";
import { polarClient, hasPolar } from "@/lib/auth";

export class AccountDAL {
  static async eraseAccount(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    let removedSlugs: string[] = [];

    await db.transaction(async (tx) => {
      // старият email преди scrub — нужен за изтриване на verification токени (PII)
      const [existing] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
      const oldEmail = existing?.email;

      // 1) блокирай при потвърдена предстояща резервация (клиент ИЛИ вендор)
      const future = await tx
        .select({ id: booking.id })
        .from(booking)
        .leftJoin(listing, eq(booking.listingId, listing.id))
        .where(
          and(
            eq(booking.status, "confirmed"),
            gte(booking.eventDate, today),
            or(eq(booking.customerId, userId), eq(listing.ownerId, userId)),
          ),
        )
        .limit(1);
      if (future.length) throw new TRPCError({ code: "CONFLICT", message: "HAS_FUTURE_BOOKINGS" });

      // 2) scrub user (CAS: идемпотентност) — рано, за да абортира двоен erase преди други мутации
      const now = new Date();
      const [scrubbed] = await tx
        .update(user)
        .set({
          name: "Изтрит потребител",
          email: `deleted+${userId}@deleted.local`,
          phone: null,
          image: null,
          emailVerified: false,
          deletedAt: now,
          anonymizedAt: now,
          updatedAt: now,
        })
        .where(and(eq(user.id, userId), isNull(user.anonymizedAt)))
        .returning({ id: user.id });
      if (!scrubbed) throw new TRPCError({ code: "CONFLICT", message: "ALREADY_ANONYMIZED" });

      // 2b) изтрий verification токени (email-verify / password-reset) по стария email — PII остатък
      if (oldEmail) await tx.delete(verification).where(eq(verification.identifier, oldEmail));

      // 3) авто-отмени pending (като клиент, после като вендор на неговите обяви)
      await tx
        .update(booking)
        .set({ status: "cancelled_by_customer", cancelReason: "account_deleted" })
        .where(and(eq(booking.customerId, userId), eq(booking.status, "pending")));
      await tx
        .update(booking)
        .set({ status: "cancelled_by_vendor", cancelReason: "account_deleted" })
        .where(
          and(
            inArray(
              booking.listingId,
              tx.select({ id: listing.id }).from(listing).where(eq(listing.ownerId, userId)),
            ),
            eq(booking.status, "pending"),
          ),
        );

      // 4-5) scrub контактни данни в booking/message (booking.phone NOT NULL → '', message.phone nullable → null)
      await tx.update(booking).set({ phone: "" }).where(eq(booking.customerId, userId));
      await tx.update(message).set({ phone: null }).where(eq(message.senderId, userId));

      // 6) обявите изчезват публично (soft) — насрещните ревюта/резервации оцеляват
      const removed = await tx
        .update(listing)
        .set({ status: "removed", updatedAt: now })
        .where(eq(listing.ownerId, userId))
        .returning({ slug: listing.slug });
      removedSlugs = removed.map((r) => r.slug);

      // 7) убий логин: session + account
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
    });

    // 7b) revalidate публичния кеш СЛЕД commit — премахнатите обяви + стария вендор име изчезват веднага
    revalidateTag("listings", { expire: 0 });
    for (const slug of removedSlugs) revalidateTag(`listing:${slug}`, { expire: 0 });

    // 8) best-effort Polar анонимизация СЛЕД commit — никога не хвърля, не rollback-ва tx
    if (hasPolar) {
      void polarClient!.customers
        .deleteExternal({ externalId: userId, anonymize: true })
        .catch((e) => console.error("Polar customer erase failed", e));
    }
  }

  // GDPR data portability — read-only dump, изключва credentials (password hash, session token, account OAuth токени)
  static async exportData(userId: string) {
    const ownListingIds = db.select({ id: listing.id }).from(listing).where(eq(listing.ownerId, userId));

    const [profile] = await db.select().from(user).where(eq(user.id, userId));
    const listings = await db.select().from(listing).where(eq(listing.ownerId, userId));
    const bookingsAsCustomer = await db.select().from(booking).where(eq(booking.customerId, userId));
    const bookingsAsVendor = await db.select().from(booking).where(inArray(booking.listingId, ownListingIds));
    const reviews = await db.select().from(review).where(eq(review.authorId, userId));
    const questions = await db.select().from(question).where(eq(question.authorId, userId));
    const threads = await db.select().from(thread).where(or(eq(thread.customerId, userId), eq(thread.vendorId, userId)));
    const sentMessages = await db.select().from(message).where(eq(message.senderId, userId));
    const saved = await db.select().from(savedListing).where(eq(savedListing.userId, userId));
    const [subscriptionRow] = await db.select().from(subscription).where(eq(subscription.userId, userId));
    const reports = await db.select().from(report).where(eq(report.reporterId, userId));

    return {
      profile: profile ?? null,
      listings,
      bookingsAsCustomer,
      bookingsAsVendor,
      reviews,
      questions,
      messages: { threads, sent: sentMessages },
      saved,
      subscription: subscriptionRow ?? null,
      reports,
    };
  }
}

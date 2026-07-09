import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { user, session, account } from "@/db/schema/auth";
import { booking } from "@/db/schema/booking";
import { listing } from "@/db/schema/catalog";
import { message } from "@/db/schema/messaging";
import { polarClient, hasPolar } from "@/lib/auth";

export class AccountDAL {
  static async eraseAccount(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    await db.transaction(async (tx) => {
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
      await tx.update(listing).set({ status: "removed", updatedAt: now }).where(eq(listing.ownerId, userId));

      // 7) убий логин: session + account
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
    });

    // 8) best-effort Polar анонимизация СЛЕД commit — никога не хвърля, не rollback-ва tx
    if (hasPolar) {
      void polarClient!.customers
        .deleteExternal({ externalId: userId, anonymize: true })
        .catch((e) => console.error("Polar customer erase failed", e));
    }
  }
}

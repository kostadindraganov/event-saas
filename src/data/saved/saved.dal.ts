import "server-only";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listing, savedListing } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import type { PublicListingCardDTO } from "@/data/catalog/public.dto";
import { cardQuery, toCard } from "@/data/catalog/public-listing.dal";
import { pgCode } from "@/data/pg";
import type { ToggleSavedResult } from "./saved.dto";

export class SavedDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser) {
    return new SavedDAL(user);
  }

  async toggle(listingId: string): Promise<ToggleSavedResult> {
    let inserted: { listingId: string }[];
    try {
      inserted = await db
        .insert(savedListing)
        .values({ userId: this.user.id, listingId })
        .onConflictDoNothing()
        .returning({ listingId: savedListing.listingId });
    } catch (err) {
      // ponytail: FK violation → неизвестна обява, не изтичаме Postgres детайли към клиента
      if (pgCode(err) === "23503") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      throw err;
    }
    if (inserted.length > 0) return { saved: true };
    await db
      .delete(savedListing)
      .where(and(eq(savedListing.userId, this.user.id), eq(savedListing.listingId, listingId)));
    return { saved: false };
  }

  async list(): Promise<PublicListingCardDTO[]> {
    // същият SQL като преди: inner join-ът комутира, published условието се мести от ON в WHERE
    const rows = await cardQuery()
      .innerJoin(savedListing, and(eq(savedListing.listingId, listing.id), eq(savedListing.userId, this.user.id)))
      .where(eq(listing.status, "published"))
      .orderBy(desc(savedListing.createdAt));
    return rows.map(toCard);
  }

  async ids(): Promise<string[]> {
    const rows = await db
      .select({ listingId: savedListing.listingId })
      .from(savedListing)
      .where(eq(savedListing.userId, this.user.id));
    return rows.map((r) => r.listingId);
  }
}

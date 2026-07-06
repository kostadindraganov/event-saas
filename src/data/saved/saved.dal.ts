import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { category, city, listing, listingImage, savedListing } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import type { PublicListingCardDTO } from "@/data/catalog/public.dto";
import { cardColumns, toCard } from "@/data/catalog/public-listing.dal";
import type { ToggleSavedResult } from "./saved.dto";

export class SavedDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser) {
    return new SavedDAL(user);
  }

  async toggle(listingId: string): Promise<ToggleSavedResult> {
    const inserted = await db
      .insert(savedListing)
      .values({ userId: this.user.id, listingId })
      .onConflictDoNothing()
      .returning({ listingId: savedListing.listingId });
    if (inserted.length > 0) return { saved: true };
    await db
      .delete(savedListing)
      .where(and(eq(savedListing.userId, this.user.id), eq(savedListing.listingId, listingId)));
    return { saved: false };
  }

  async list(): Promise<PublicListingCardDTO[]> {
    const rows = await db
      .select(cardColumns)
      .from(savedListing)
      .innerJoin(listing, and(eq(savedListing.listingId, listing.id), eq(listing.status, "published")))
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .where(eq(savedListing.userId, this.user.id))
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

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listing, listingServiceRegion } from "@/db/schema";
import { slugifyBg } from "@/lib/slug";
import type { SessionUser } from "@/data/users/require-user";
import { canCreateListing, canEditListing, canSubmitListing } from "./catalog.policy";
import type { ListingCreateInput, ListingDTO, ListingSummaryDTO, ListingUpdateInput } from "./catalog.dto";
import { PublicListingDAL } from "./public-listing.dal";

type ListingRow = typeof listing.$inferSelect;

function toDTO(row: ListingRow, serviceRegionIds: string[]): ListingDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    categoryId: row.categoryId,
    cityId: row.cityId,
    wholeCountry: row.wholeCountry,
    serviceRegionIds,
    priceFromCents: row.priceFromCents,
    coverImageId: row.coverImageId,
    rejectionReason: row.rejectionReason,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  };
}

export class ListingDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser) {
    return new ListingDAL(user);
  }

  static public(): PublicListingDAL {
    return new PublicListingDAL();
  }

  private async ownedRow(id: string): Promise<ListingRow> {
    const [row] = await db.select().from(listing).where(eq(listing.id, id));
    if (!row) throw new Error("NOT_FOUND");
    if (!canEditListing(this.user, row)) throw new Error("FORBIDDEN");
    return row;
  }

  private async regionIds(listingId: string): Promise<string[]> {
    const rows = await db
      .select({ regionId: listingServiceRegion.regionId })
      .from(listingServiceRegion)
      .where(eq(listingServiceRegion.listingId, listingId));
    return rows.map((r) => r.regionId);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugifyBg(title) || "obiava";
    for (let i = 1; i <= 50; i++) {
      const candidate = i === 1 ? base : `${base}-${i}`;
      const [hit] = await db.select({ id: listing.id }).from(listing).where(eq(listing.slug, candidate));
      if (!hit) return candidate;
    }
    throw new Error("SLUG_EXHAUSTED");
  }

  async createDraft(input: ListingCreateInput): Promise<ListingDTO> {
    if (!canCreateListing(this.user)) throw new Error("FORBIDDEN");
    const slug = await this.uniqueSlug(input.title);
    const [row] = await db
      .insert(listing)
      .values({ ownerId: this.user.id, categoryId: input.categoryId, cityId: input.cityId, title: input.title, slug })
      .returning();
    if (!row) throw new Error("INSERT_FAILED");
    return toDTO(row, []);
  }

  async update(input: ListingUpdateInput): Promise<ListingDTO> {
    await this.ownedRow(input.id);
    const { id, serviceRegionIds, ...fields } = input;
    const [row] = await db
      .update(listing)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(listing.id, id))
      .returning();
    if (!row) throw new Error("NOT_FOUND");
    if (serviceRegionIds) {
      await db.delete(listingServiceRegion).where(eq(listingServiceRegion.listingId, id));
      if (serviceRegionIds.length > 0) {
        await db.insert(listingServiceRegion).values(serviceRegionIds.map((regionId) => ({ listingId: id, regionId })));
      }
    }
    return toDTO(row, await this.regionIds(id));
  }

  async submit(id: string): Promise<ListingDTO> {
    const row = await this.ownedRow(id);
    if (!canSubmitListing(this.user, row)) throw new Error("FORBIDDEN");
    // ponytail: Ф1 публикува директно; pending_approval gate идва с админ панела (Ф2)
    const [updated] = await db
      .update(listing)
      .set({ status: "published", publishedAt: new Date(), rejectionReason: null, updatedAt: new Date() })
      .where(eq(listing.id, id))
      .returning();
    if (!updated) throw new Error("NOT_FOUND");
    return toDTO(updated, await this.regionIds(id));
  }

  private async setStatus(id: string, from: "published" | "hidden", to: "published" | "hidden"): Promise<ListingDTO> {
    const row = await this.ownedRow(id);
    if (row.status !== from) throw new Error("FORBIDDEN");
    const [updated] = await db
      .update(listing)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(listing.id, id), eq(listing.status, from)))
      .returning();
    if (!updated) throw new Error("NOT_FOUND");
    return toDTO(updated, await this.regionIds(id));
  }

  hide(id: string) {
    return this.setStatus(id, "published", "hidden");
  }

  unhide(id: string) {
    return this.setStatus(id, "hidden", "published");
  }

  async listMine(): Promise<ListingSummaryDTO[]> {
    const rows = await db.select().from(listing).where(eq(listing.ownerId, this.user.id));
    return rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, status: r.status,
      categoryId: r.categoryId, cityId: r.cityId,
      priceFromCents: r.priceFromCents, coverImageId: r.coverImageId,
    }));
  }

  async getForOwner(id: string): Promise<ListingDTO> {
    const row = await this.ownedRow(id);
    return toDTO(row, await this.regionIds(id));
  }
}

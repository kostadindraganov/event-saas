import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { listing, listingServiceRegion } from "@/db/schema";
import { slugifyBg } from "@/lib/slug";
import { pgCode } from "@/data/pg";
import type { SessionUser } from "@/data/users/require-user";
import { canCreateListing, canEditListing, canSubmitListing, LISTING_TRANSITIONS } from "./catalog.policy";
import type { ListingCreateInput, ListingDTO, ListingSummaryDTO, ListingUpdateInput } from "./catalog.dto";
import { PublicListingDAL } from "./public-listing.dal";
import { BillingDAL } from "@/data/billing/billing.dal";

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
    // TOCTOU: uniqueSlug() е SELECT-then-decide без lock — конкурентен createDraft със същото заглавие
    // може да вкара същия slug между нашия pre-check и нашия insert. Retry-ваме bounded на 23505.
    for (let attempt = 1; attempt <= 50; attempt++) {
      const slug = await this.uniqueSlug(input.title);
      try {
        const [row] = await db
          .insert(listing)
          .values({ ownerId: this.user.id, categoryId: input.categoryId, cityId: input.cityId, title: input.title, slug })
          .returning();
        if (!row) throw new Error("INSERT_FAILED");
        return toDTO(row, []);
      } catch (err) {
        if (pgCode(err) !== "23505" || attempt === 50) throw err;
      }
    }
    throw new Error("SLUG_EXHAUSTED");
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
    const userId = this.user.id;
    // M2.3: submit → pending_approval (не published); admin approve() (AdminDAL, Задача 5) сеща publishedAt.
    // assertCanPublish тук е мек fail-fast pre-check за UX (нищо не се консумира при pending) —
    // авторитетната проверка е в AdminDAL.approve(), единственият преход, който реално консумира лимита.
    // транзакция: entitlement pre-check + CAS UPDATE атомарно (затваря TOCTOU при конкурентен submit)
    const updated = await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ categoryId: listing.categoryId, status: listing.status })
        .from(listing)
        .where(eq(listing.id, id));
      if (!fresh || !LISTING_TRANSITIONS.submit.from.includes(fresh.status)) throw new Error("FORBIDDEN");
      await BillingDAL.assertCanPublish(tx, userId, fresh.categoryId, id);
      const [updatedRow] = await tx
        .update(listing)
        .set({
          status: LISTING_TRANSITIONS.submit.to,
          rejectionReason: null,
          hiddenBySystem: false,
          updatedAt: new Date(),
        })
        .where(and(eq(listing.id, id), inArray(listing.status, LISTING_TRANSITIONS.submit.from)))
        .returning();
      if (!updatedRow) throw new Error("FORBIDDEN"); // CAS изгубена — статусът се е сменил конкурентно
      return updatedRow;
    });
    return toDTO(updated, await this.regionIds(id));
  }

  async hide(id: string): Promise<ListingDTO> {
    const row = await this.ownedRow(id);
    if (!LISTING_TRANSITIONS.hide.from.includes(row.status)) throw new Error("FORBIDDEN");
    const [updated] = await db
      .update(listing)
      .set({ status: LISTING_TRANSITIONS.hide.to, updatedAt: new Date() })
      .where(and(eq(listing.id, id), inArray(listing.status, LISTING_TRANSITIONS.hide.from)))
      .returning();
    if (!updated) throw new Error("NOT_FOUND");
    return toDTO(updated, await this.regionIds(id));
  }

  async unhide(id: string): Promise<ListingDTO> {
    const row = await this.ownedRow(id);
    if (!LISTING_TRANSITIONS.unhide.from.includes(row.status)) throw new Error("FORBIDDEN");
    const userId = this.user.id;
    // транзакция: entitlement guard + CAS UPDATE атомарно (иначе hide→unhide заобикаля лимита от submit())
    const updated = await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select({ categoryId: listing.categoryId, status: listing.status })
        .from(listing)
        .where(eq(listing.id, id));
      if (!fresh || !LISTING_TRANSITIONS.unhide.from.includes(fresh.status)) throw new Error("FORBIDDEN");
      await BillingDAL.assertCanPublish(tx, userId, fresh.categoryId, id);
      const [updatedRow] = await tx
        .update(listing)
        .set({ status: LISTING_TRANSITIONS.unhide.to, hiddenBySystem: false, updatedAt: new Date() })
        .where(and(eq(listing.id, id), inArray(listing.status, LISTING_TRANSITIONS.unhide.from)))
        .returning();
      if (!updatedRow) throw new Error("FORBIDDEN"); // CAS изгубена
      return updatedRow;
    });
    return toDTO(updated, await this.regionIds(id));
  }

  async listMine(): Promise<ListingSummaryDTO[]> {
    const rows = await db.select().from(listing).where(eq(listing.ownerId, this.user.id));
    return rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, status: r.status,
      categoryId: r.categoryId, cityId: r.cityId,
      priceFromCents: r.priceFromCents, coverImageId: r.coverImageId,
      rejectionReason: r.rejectionReason,
    }));
  }

  async getForOwner(id: string): Promise<ListingDTO> {
    const row = await this.ownedRow(id);
    return toDTO(row, await this.regionIds(id));
  }
}

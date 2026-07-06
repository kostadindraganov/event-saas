import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listing, listingImage } from "@/db/schema";
import { deleteImage, requestDirectUpload } from "@/lib/images";
import type { SessionUser } from "@/data/users/require-user";
import { canEditListing } from "@/data/catalog/catalog.policy";

const MAX_IMAGES = 30;

async function assertOwned(user: SessionUser, listingId: string) {
  const [row] = await db.select().from(listing).where(eq(listing.id, listingId));
  if (!row) throw new Error("NOT_FOUND");
  if (!canEditListing(user, row)) throw new Error("FORBIDDEN");
  return row;
}

export class MediaDAL {
  private constructor(private readonly user: SessionUser) {}
  static for(user: SessionUser) { return new MediaDAL(user); }

  async requestUpload(listingId: string) {
    await assertOwned(this.user, listingId);
    const existing = await this.listByListing(listingId);
    if (existing.length >= MAX_IMAGES) throw new Error("IMAGE_LIMIT");
    return requestDirectUpload();
  }

  async confirm(listingId: string, cfImageId: string) {
    await assertOwned(this.user, listingId);
    const existing = await this.listByListing(listingId);
    if (existing.length >= MAX_IMAGES) throw new Error("IMAGE_LIMIT");
    const [row] = await db
      .insert(listingImage)
      .values({ listingId, cfImageId, sortOrder: existing.length })
      .returning();
    // първата снимка автоматично става cover
    if (existing.length === 0) {
      await db.update(listing).set({ coverImageId: row!.id }).where(eq(listing.id, listingId));
    }
    return row!;
  }

  async remove(imageId: string): Promise<void> {
    const [img] = await db.select().from(listingImage).where(eq(listingImage.id, imageId));
    if (!img) throw new Error("NOT_FOUND");
    const owner = await assertOwned(this.user, img.listingId);
    await db.delete(listingImage).where(eq(listingImage.id, imageId));
    if (owner.coverImageId === imageId) {
      await db.update(listing).set({ coverImageId: null }).where(eq(listing.id, img.listingId));
    }
    await deleteImage(img.cfImageId);
  }

  async setCover(listingId: string, imageId: string): Promise<void> {
    await assertOwned(this.user, listingId);
    const [img] = await db.select().from(listingImage).where(eq(listingImage.id, imageId));
    if (!img || img.listingId !== listingId) throw new Error("NOT_FOUND");
    await db.update(listing).set({ coverImageId: imageId }).where(eq(listing.id, listingId));
  }

  async listByListing(listingId: string) {
    return db
      .select()
      .from(listingImage)
      .where(eq(listingImage.listingId, listingId))
      .orderBy(asc(listingImage.sortOrder));
  }
}

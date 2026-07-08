import "server-only";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { listing, review, reviewImage } from "@/db/schema";
import { deleteImage, requestDirectUpload } from "@/lib/images";
import type { SessionUser } from "@/data/users/require-user";
import type { ReviewImageDTO } from "./review.dto";

const MAX_REVIEW_IMAGES = 5;

// choke-point: ownership = АВТОРЪТ на review-то (не собственикът на обявата, D8). Чужд ресурс →
// NOT_FOUND без enumeration (global constraint), не FORBIDDEN.
async function assertReviewOwned(user: SessionUser, reviewId: string): Promise<{ listingId: string; listingSlug: string }> {
  const [row] = await db.select({ authorId: review.authorId, listingId: review.listingId, listingSlug: listing.slug })
    .from(review).innerJoin(listing, eq(review.listingId, listing.id)).where(eq(review.id, reviewId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (row.authorId !== user.id) throw new TRPCError({ code: "NOT_FOUND" });
  return { listingId: row.listingId, listingSlug: row.listingSlug };
}

export class ReviewMediaDAL {
  private constructor(private readonly user: SessionUser) {}
  static for(user: SessionUser): ReviewMediaDAL { return new ReviewMediaDAL(user); }

  async requestUpload(reviewId: string): Promise<{ cfImageId: string; uploadURL: string }> {
    await assertReviewOwned(this.user, reviewId);
    const existing = await this.listRows(reviewId);
    if (existing.length >= MAX_REVIEW_IMAGES) throw new TRPCError({ code: "CONFLICT", message: "IMAGE_LIMIT" });
    return requestDirectUpload();
  }

  async confirm(reviewId: string, cfImageId: string): Promise<ReviewImageDTO> {
    const owned = await assertReviewOwned(this.user, reviewId);
    const existing = await this.listRows(reviewId);
    if (existing.length >= MAX_REVIEW_IMAGES) throw new TRPCError({ code: "CONFLICT", message: "IMAGE_LIMIT" });
    const [row] = await db.insert(reviewImage).values({ reviewId, cfImageId }).returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    revalidateTag(`listing:${owned.listingSlug}`, { expire: 0 });
    return { id: row.id, cfImageId: row.cfImageId };
  }

  async remove(imageId: string): Promise<void> {
    const [img] = await db.select({ id: reviewImage.id, reviewId: reviewImage.reviewId, cfImageId: reviewImage.cfImageId })
      .from(reviewImage).where(eq(reviewImage.id, imageId));
    if (!img) throw new TRPCError({ code: "NOT_FOUND" });
    const owned = await assertReviewOwned(this.user, img.reviewId);
    await db.delete(reviewImage).where(eq(reviewImage.id, imageId));
    await deleteImage(img.cfImageId);
    revalidateTag(`listing:${owned.listingSlug}`, { expire: 0 });
  }

  private async listRows(reviewId: string) {
    return db.select().from(reviewImage).where(eq(reviewImage.reviewId, reviewId));
  }
}

import "server-only";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { booking, listing, review } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { recomputeListingRating } from "./aggregate";
import type { ReviewCreateInput } from "./review.dto";

const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

// drizzle-orm/neon-serverless обвива pg грешката — реалният код е в err.cause.code (копирано от admin.dal.ts)
function pgCode(err: unknown): string | undefined {
  return (err as { cause?: { code?: string } })?.cause?.code;
}

// споделено между create()/edit() — 5-те под-оценки → ratingOverall numeric(3,2) като string
function ratingOverallOf(input: {
  ratingQuality: number; ratingCommunication: number; ratingProfessionalism: number;
  ratingValue: number; ratingFlexibility: number;
}): string {
  const sum = input.ratingQuality + input.ratingCommunication + input.ratingProfessionalism
    + input.ratingValue + input.ratingFlexibility;
  return (sum / 5).toFixed(2);
}

export class ReviewDAL {
  private constructor(private readonly user: SessionUser | null) {}

  static for(user: SessionUser): ReviewDAL { return new ReviewDAL(user); }
  static public(): ReviewDAL { return new ReviewDAL(null); }

  // choke-point: методите за логнат потребител (create/edit/reply) викат това първо.
  // public() инстанции нямат user — само listByListing() ги ползва и то не изисква логин.
  private requireUser(): SessionUser {
    if (!this.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return this.user;
  }

  // CREATE: авторът на completed резервация, 1/booking. Ownership guard-ове без enumeration → NOT_FOUND.
  async create(input: ReviewCreateInput): Promise<{ id: string; listingSlug: string }> {
    const authUser = this.requireUser();
    const [b] = await db.select({
      customerId: booking.customerId, status: booking.status, listingId: booking.listingId, eventDate: booking.eventDate,
    }).from(booking).where(eq(booking.id, input.bookingId));
    if (!b || b.customerId !== authUser.id) throw new TRPCError({ code: "NOT_FOUND" });
    if (b.status !== "completed") throw new TRPCError({ code: "CONFLICT", message: "NOT_COMPLETED" });

    const [l] = await db.select({ slug: listing.slug }).from(listing).where(eq(listing.id, b.listingId));
    if (!l) throw new TRPCError({ code: "NOT_FOUND" });

    const now = new Date();
    const editableUntil = new Date(now.getTime() + EDIT_WINDOW_MS);
    const ratingOverall = ratingOverallOf(input);

    const id = await db.transaction(async (tx) => {
      let row: { id: string } | undefined;
      try {
        [row] = await tx.insert(review).values({
          bookingId: input.bookingId, listingId: b.listingId, authorId: authUser.id,
          ratingQuality: input.ratingQuality, ratingCommunication: input.ratingCommunication,
          ratingProfessionalism: input.ratingProfessionalism, ratingValue: input.ratingValue,
          ratingFlexibility: input.ratingFlexibility, ratingOverall,
          title: input.title, body: input.body, wouldRecommend: input.wouldRecommend,
          eventDate: b.eventDate, editableUntil, createdAt: now,
        }).returning({ id: review.id });
      } catch (err) {
        if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "ALREADY_REVIEWED" });
        throw err;
      }
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await recomputeListingRating(tx, b.listingId);
      return row.id;
    });

    revalidateTag(`listing:${l.slug}`, { expire: 0 });
    revalidateTag("listings", { expire: 0 });
    return { id, listingSlug: l.slug };
  }
}

import "server-only";
import { revalidateTag } from "next/cache";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { booking, listing, review, reviewImage, user } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { recomputeListingRating } from "./aggregate";
import type {
  ReviewCreateInput, ReviewEditInput, ReviewImageDTO, ReviewPublicDTO, ReviewReplyInput,
  MyReviewDTO, VendorReviewDTO,
} from "./review.dto";

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

// споделени select колони за ReviewPublicDTO (без images) — listByListing/listForOwner/mine ги ползват
// през toPublicDTO(), за да не дублират mapping-а на три места.
const reviewSelectColumns = {
  id: review.id, authorName: user.name, ratingOverall: review.ratingOverall,
  ratingQuality: review.ratingQuality, ratingCommunication: review.ratingCommunication,
  ratingProfessionalism: review.ratingProfessionalism, ratingValue: review.ratingValue,
  ratingFlexibility: review.ratingFlexibility, title: review.title, body: review.body,
  wouldRecommend: review.wouldRecommend, eventDate: review.eventDate,
  replyText: review.replyText, replyUpdatedAt: review.replyUpdatedAt, createdAt: review.createdAt,
};

type ReviewRow = {
  id: string; authorName: string; ratingOverall: string;
  ratingQuality: number; ratingCommunication: number; ratingProfessionalism: number;
  ratingValue: number; ratingFlexibility: number; title: string; body: string;
  wouldRecommend: boolean; eventDate: string; replyText: string | null;
  replyUpdatedAt: Date | null; createdAt: Date;
};

function toPublicDTO(r: ReviewRow, images: ReviewImageDTO[]): ReviewPublicDTO {
  return {
    id: r.id, authorName: r.authorName, ratingOverall: Number(r.ratingOverall),
    ratingQuality: r.ratingQuality, ratingCommunication: r.ratingCommunication,
    ratingProfessionalism: r.ratingProfessionalism, ratingValue: r.ratingValue, ratingFlexibility: r.ratingFlexibility,
    title: r.title, body: r.body, wouldRecommend: r.wouldRecommend, eventDate: r.eventDate,
    replyText: r.replyText, replyUpdatedAt: r.replyUpdatedAt, images, createdAt: r.createdAt,
  };
}

// batch image fetch, споделено между listByListing/listForOwner/mine.
async function imagesForIds(reviewIds: string[]): Promise<Map<string, ReviewImageDTO[]>> {
  const map = new Map<string, ReviewImageDTO[]>();
  if (reviewIds.length === 0) return map;
  const imageRows = await db.select({ id: reviewImage.id, reviewId: reviewImage.reviewId, cfImageId: reviewImage.cfImageId })
    .from(reviewImage).where(inArray(reviewImage.reviewId, reviewIds));
  for (const img of imageRows) {
    const list = map.get(img.reviewId) ?? [];
    list.push({ id: img.id, cfImageId: img.cfImageId });
    map.set(img.reviewId, list);
  }
  return map;
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

  // EDIT: авторът до editableUntil; след това само admin. Admin може да редактира ВСЯКО ревю
  // (модерационна власт, не е обвързана с авторство — D4: "след това само админ").
  async edit(input: ReviewEditInput): Promise<{ listingSlug: string }> {
    const authUser = this.requireUser();
    const [row] = await db.select({
      authorId: review.authorId, listingId: review.listingId, editableUntil: review.editableUntil,
    }).from(review).where(eq(review.id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    const isAuthor = row.authorId === authUser.id;
    if (!isAuthor && !authUser.isAdmin) throw new TRPCError({ code: "NOT_FOUND" });
    if (isAuthor && !authUser.isAdmin && new Date() >= row.editableUntil) {
      throw new TRPCError({ code: "FORBIDDEN", message: "EDIT_WINDOW_CLOSED" });
    }

    const [l] = await db.select({ slug: listing.slug }).from(listing).where(eq(listing.id, row.listingId));
    if (!l) throw new TRPCError({ code: "NOT_FOUND" });

    const ratingOverall = ratingOverallOf(input);
    await db.transaction(async (tx) => {
      await tx.update(review).set({
        ratingQuality: input.ratingQuality, ratingCommunication: input.ratingCommunication,
        ratingProfessionalism: input.ratingProfessionalism, ratingValue: input.ratingValue,
        ratingFlexibility: input.ratingFlexibility, ratingOverall,
        title: input.title, body: input.body, wouldRecommend: input.wouldRecommend,
      }).where(eq(review.id, input.id));
      await recomputeListingRating(tx, row.listingId);
    });

    revalidateTag(`listing:${l.slug}`, { expire: 0 });
    revalidateTag("listings", { expire: 0 });
    return { listingSlug: l.slug };
  }

  // REPLY: собственикът на обявата ИЛИ admin. Един слот, editable неограничено. БЕЗ агрегат промяна.
  async reply(input: ReviewReplyInput): Promise<{ listingSlug: string }> {
    const authUser = this.requireUser();
    const [row] = await db.select({
      listingOwnerId: listing.ownerId, listingSlug: listing.slug,
    }).from(review).innerJoin(listing, eq(review.listingId, listing.id)).where(eq(review.id, input.reviewId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (row.listingOwnerId !== authUser.id && !authUser.isAdmin) throw new TRPCError({ code: "NOT_FOUND" });

    await db.update(review).set({ replyText: input.text, replyUpdatedAt: new Date() }).where(eq(review.id, input.reviewId));
    revalidateTag(`listing:${row.listingSlug}`, { expire: 0 });
    return { listingSlug: row.listingSlug };
  }

  // PUBLIC read за obiava страницата (visible само, с images). Вика се от ReviewDAL.public() в
  // getBySlug batch-а (decision A). Не изисква this.user — работи еднакво за for()/public().
  async listByListing(listingId: string): Promise<ReviewPublicDTO[]> {
    const rows = await db.select(reviewSelectColumns)
      .from(review)
      .innerJoin(user, eq(review.authorId, user.id))
      .where(and(eq(review.listingId, listingId), eq(review.status, "visible")))
      .orderBy(desc(review.createdAt));
    if (rows.length === 0) return [];

    const imagesByReview = await imagesForIds(rows.map((r) => r.id));
    return rows.map((r) => toPublicDTO(r, imagesByReview.get(r.id) ?? []));
  }

  // vendor панел: ревюта по ВСИЧКИ обяви на owner-а (за reply UI, D9). removed се изключва —
  // премахнатите ревюта не се reply-ват. protected; JOIN listing.ownerId===user.id.
  async listForOwner(): Promise<VendorReviewDTO[]> {
    const authUser = this.requireUser();
    const rows = await db.select({ ...reviewSelectColumns, listingTitle: listing.title, status: review.status })
      .from(review)
      .innerJoin(user, eq(review.authorId, user.id))
      .innerJoin(listing, eq(listing.id, review.listingId))
      .where(and(eq(listing.ownerId, authUser.id), inArray(review.status, ["visible", "hidden_by_admin"])))
      .orderBy(desc(review.createdAt));
    if (rows.length === 0) return [];

    const imagesByReview = await imagesForIds(rows.map((r) => r.id));
    return rows.map((r) => ({
      ...toPublicDTO(r, imagesByReview.get(r.id) ?? []),
      listingTitle: r.listingTitle,
      status: r.status as "visible" | "hidden_by_admin",
    }));
  }

  // авторово ревю за конкретен booking (за self-edit UI, D11). null ако няма ревю ЗА ТОЗИ user
  // (чужд ресурс → null, без enumeration — огледално на другите guard-ове в този файл).
  async mine(bookingId: string): Promise<MyReviewDTO | null> {
    const authUser = this.requireUser();
    const [row] = await db.select({ ...reviewSelectColumns, editableUntil: review.editableUntil })
      .from(review)
      .innerJoin(user, eq(review.authorId, user.id))
      .where(and(eq(review.bookingId, bookingId), eq(review.authorId, authUser.id)));
    if (!row) return null;
    const images = (await imagesForIds([row.id])).get(row.id) ?? [];
    return { ...toPublicDTO(row, images), editableUntil: row.editableUntil, canEdit: new Date() < row.editableUntil };
  }

  // D7 cron: booking status='completed' И eventDate==targetDate И без ревю → напомняне. Static —
  // cron няма user context. Anti-join срещу review през уникалния bookingId индекс, вместо
  // да теглим цялата review таблица за NOT IN.
  static async findReminderTargets(targetDate: string): Promise<{ bookingId: string; email: string; listingTitle: string }[]> {
    return db.select({ bookingId: booking.id, email: user.email, listingTitle: listing.title })
      .from(booking)
      .innerJoin(user, eq(booking.customerId, user.id))
      .innerJoin(listing, eq(booking.listingId, listing.id))
      .leftJoin(review, eq(review.bookingId, booking.id))
      .where(and(
        eq(booking.status, "completed"),
        eq(booking.eventDate, targetDate),
        isNull(review.id),
      ));
  }
}

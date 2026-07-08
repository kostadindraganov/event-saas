import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/db";
import { listing, question, user } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";

export type QuestionPublicDTO = {
  id: string;
  authorName: string;
  body: string;
  answerText: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

export const QuestionAskSchema = z.object({
  listingId: z.uuid(),
  body: z.string().min(5).max(1000),
});
export type QuestionAskInput = z.infer<typeof QuestionAskSchema>;

export const QuestionAnswerSchema = z.object({
  questionId: z.uuid(),
  text: z.string().min(2).max(2000),
});
export type QuestionAnswerInput = z.infer<typeof QuestionAnswerSchema>;

export class QaDAL {
  private constructor(private readonly user: SessionUser | null) {}

  static for(user: SessionUser): QaDAL {
    return new QaDAL(user);
  }

  static public(): QaDAL {
    return new QaDAL(null);
  }

  // protected; всеки регистриран пита; visible by default (schema default)
  async ask(input: QuestionAskInput): Promise<{ id: string }> {
    if (!this.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const [row] = await db
      .insert(question)
      .values({ listingId: input.listingId, authorId: this.user.id, body: input.body })
      .returning({ id: question.id });
    return row!;
  }

  // owner на обявата ИЛИ admin (JOIN listing.ownerId); чужд потребител → NOT_FOUND (без enumeration)
  async answer(input: QuestionAnswerInput): Promise<void> {
    if (!this.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const [row] = await db
      .select({ ownerId: listing.ownerId })
      .from(question)
      .innerJoin(listing, eq(question.listingId, listing.id))
      .where(eq(question.id, input.questionId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (row.ownerId !== this.user.id && !this.user.isAdmin) throw new TRPCError({ code: "NOT_FOUND" });
    await db
      .update(question)
      .set({ answerText: input.text, answeredAt: new Date() })
      .where(eq(question.id, input.questionId));
  }

  // vendor панел: въпроси по ВСИЧКИ обяви на owner-а (за answer UI, D9). protected; JOIN listing.ownerId.
  async listForOwner(): Promise<(QuestionPublicDTO & { listingTitle: string })[]> {
    if (!this.user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return db
      .select({
        id: question.id,
        authorName: user.name,
        body: question.body,
        answerText: question.answerText,
        answeredAt: question.answeredAt,
        createdAt: question.createdAt,
        listingTitle: listing.title,
      })
      .from(question)
      .innerJoin(user, eq(question.authorId, user.id))
      .innerJoin(listing, eq(listing.id, question.listingId))
      .where(and(eq(listing.ownerId, this.user.id), eq(question.status, "visible")))
      .orderBy(desc(question.createdAt));
  }

  // public(); visible само; desc createdAt
  async listByListing(listingId: string): Promise<QuestionPublicDTO[]> {
    return db
      .select({
        id: question.id,
        authorName: user.name,
        body: question.body,
        answerText: question.answerText,
        answeredAt: question.answeredAt,
        createdAt: question.createdAt,
      })
      .from(question)
      .innerJoin(user, eq(question.authorId, user.id))
      .where(and(eq(question.listingId, listingId), eq(question.status, "visible")))
      .orderBy(desc(question.createdAt));
  }
}

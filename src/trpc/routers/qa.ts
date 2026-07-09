import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { rateLimited } from "../rate-limit";
import { QaDAL, QuestionAskSchema, QuestionAnswerSchema } from "@/data/reviews/qa.dal";

export const qaRouter = createTRPCRouter({
  ask: rateLimited("qa.ask", 10, 3_600_000).input(QuestionAskSchema).mutation(({ ctx, input }) => QaDAL.for(ctx.user).ask(input)),
  answer: protectedProcedure.input(QuestionAnswerSchema).mutation(({ ctx, input }) => QaDAL.for(ctx.user).answer(input)),
  listByListing: publicProcedure
    .input(z.object({ listingId: z.uuid() }))
    .query(({ input }) => QaDAL.public().listByListing(input.listingId)),
  listForOwner: protectedProcedure.query(({ ctx }) => QaDAL.for(ctx.user).listForOwner()),
});

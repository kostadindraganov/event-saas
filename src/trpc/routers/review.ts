import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { ReviewDAL } from "@/data/reviews/review.dal";
import { ReviewMediaDAL } from "@/data/reviews/review-media.dal";
import { ReviewCreateSchema, ReviewEditSchema, ReviewReplySchema } from "@/data/reviews/review.dto";

export const reviewRouter = createTRPCRouter({
  create: protectedProcedure.input(ReviewCreateSchema).mutation(({ ctx, input }) => ReviewDAL.for(ctx.user).create(input)),
  edit: protectedProcedure.input(ReviewEditSchema).mutation(({ ctx, input }) => ReviewDAL.for(ctx.user).edit(input)),
  reply: protectedProcedure.input(ReviewReplySchema).mutation(({ ctx, input }) => ReviewDAL.for(ctx.user).reply(input)),
  requestUpload: protectedProcedure
    .input(z.object({ reviewId: z.uuid() }))
    .mutation(({ ctx, input }) => ReviewMediaDAL.for(ctx.user).requestUpload(input.reviewId)),
  confirmUpload: protectedProcedure
    .input(z.object({ reviewId: z.uuid(), cfImageId: z.string().min(1).max(128) }))
    .mutation(({ ctx, input }) => ReviewMediaDAL.for(ctx.user).confirm(input.reviewId, input.cfImageId)),
});

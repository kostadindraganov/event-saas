import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createTRPCRouter, protectedProcedure } from "../init";
import { MediaDAL } from "@/data/media/media.dal";

const byListing = z.object({ listingId: z.uuid() });

export const mediaRouter = createTRPCRouter({
  requestUpload: protectedProcedure.input(byListing).mutation(({ ctx, input }) => MediaDAL.for(ctx.user).requestUpload(input.listingId)),
  confirm: protectedProcedure
    .input(z.object({ listingId: z.uuid(), cfImageId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const r = await MediaDAL.for(ctx.user).confirm(input.listingId, input.cfImageId);
      revalidateTag("listings", { expire: 0 });
      return r;
    }),
  remove: protectedProcedure.input(z.object({ imageId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const r = await MediaDAL.for(ctx.user).remove(input.imageId);
    revalidateTag("listings", { expire: 0 });
    return r;
  }),
  setCover: protectedProcedure
    .input(z.object({ listingId: z.uuid(), imageId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const r = await MediaDAL.for(ctx.user).setCover(input.listingId, input.imageId);
      revalidateTag("listings", { expire: 0 });
      return r;
    }),
  listByListing: protectedProcedure.input(byListing).query(({ ctx, input }) => MediaDAL.for(ctx.user).listByListing(input.listingId)),
});

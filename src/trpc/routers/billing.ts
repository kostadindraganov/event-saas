import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createTRPCRouter, protectedProcedure } from "../init";
import { BillingDAL } from "@/data/billing/billing.dal";

export const billingRouter = createTRPCRouter({
  mine: protectedProcedure
    .input(z.object({ locale: z.enum(["bg", "en"]) }))
    .query(({ ctx, input }) => BillingDAL.for(ctx.user).mine(input.locale)),
  restoreListings: protectedProcedure.mutation(async ({ ctx }) => {
    const r = await BillingDAL.for(ctx.user).restoreListings();
    revalidateTag("listings", { expire: 0 });
    return r;
  }),
  keepListing: protectedProcedure
    .input(z.object({ listingId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await BillingDAL.for(ctx.user).keepListing(input.listingId);
      revalidateTag("listings", { expire: 0 });
    }),
});

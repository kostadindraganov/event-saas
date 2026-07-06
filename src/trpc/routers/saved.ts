import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { SavedDAL } from "@/data/saved/saved.dal";

export const savedRouter = createTRPCRouter({
  toggle: protectedProcedure
    .input(z.object({ listingId: z.uuid() }))
    .mutation(({ ctx, input }) => SavedDAL.for(ctx.user).toggle(input.listingId)),
  list: protectedProcedure.query(({ ctx }) => SavedDAL.for(ctx.user).list()),
  ids: protectedProcedure.query(({ ctx }) => SavedDAL.for(ctx.user).ids()),
});

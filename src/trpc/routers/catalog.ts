import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { TaxonomyDAL } from "@/data/catalog/taxonomy.dal";
import { ListingCreateInputSchema, ListingUpdateInputSchema } from "@/data/catalog/catalog.dto";

const byId = z.object({ id: z.uuid() });

export const catalogRouter = createTRPCRouter({
  listing: createTRPCRouter({
    createDraft: protectedProcedure
      .input(ListingCreateInputSchema)
      .mutation(({ ctx, input }) => ListingDAL.for(ctx.user).createDraft(input)),
    update: protectedProcedure
      .input(ListingUpdateInputSchema)
      .mutation(({ ctx, input }) => ListingDAL.for(ctx.user).update(input)),
    submit: protectedProcedure.input(byId).mutation(({ ctx, input }) => ListingDAL.for(ctx.user).submit(input.id)),
    hide: protectedProcedure.input(byId).mutation(({ ctx, input }) => ListingDAL.for(ctx.user).hide(input.id)),
    unhide: protectedProcedure.input(byId).mutation(({ ctx, input }) => ListingDAL.for(ctx.user).unhide(input.id)),
    listMine: protectedProcedure.query(({ ctx }) => ListingDAL.for(ctx.user).listMine()),
    getForOwner: protectedProcedure.input(byId).query(({ ctx, input }) => ListingDAL.for(ctx.user).getForOwner(input.id)),
  }),
  category: createTRPCRouter({
    list: publicProcedure.query(() => TaxonomyDAL.public().listCategories()),
  }),
  location: createTRPCRouter({
    listRegions: publicProcedure.query(() => TaxonomyDAL.public().listRegions()),
    searchCities: publicProcedure
      .input(z.object({ query: z.string().min(1).max(60) }))
      .query(({ input }) => TaxonomyDAL.public().searchCities(input.query)),
  }),
});

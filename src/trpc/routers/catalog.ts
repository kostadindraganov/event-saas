import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { TaxonomyDAL } from "@/data/catalog/taxonomy.dal";
import { AttributeDAL } from "@/data/catalog/attribute.dal";
import { PackageDAL, VideoDAL } from "@/data/catalog/package.dal";
import { ListingCreateInputSchema, ListingUpdateInputSchema, PackageInputSchema } from "@/data/catalog/catalog.dto";
import { SetAttributeValuesInputSchema } from "@/data/catalog/attribute.dto";

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
  attribute: createTRPCRouter({
    definitionsByCategory: publicProcedure
      .input(z.object({ categoryId: z.uuid() }))
      .query(({ input }) => AttributeDAL.public().definitionsByCategory(input.categoryId)),
    setValues: protectedProcedure
      .input(SetAttributeValuesInputSchema)
      .mutation(({ ctx, input }) => AttributeDAL.for(ctx.user).setValues(input.listingId, input.values)),
    getValues: protectedProcedure
      .input(z.object({ listingId: z.uuid() }))
      .query(({ ctx, input }) => AttributeDAL.for(ctx.user).getValues(input.listingId)),
  }),
  package: createTRPCRouter({
    create: protectedProcedure.input(PackageInputSchema).mutation(({ ctx, input }) => PackageDAL.for(ctx.user).create(input)),
    update: protectedProcedure
      .input(PackageInputSchema.partial().omit({ listingId: true }).extend({ id: z.uuid() }))
      .mutation(({ ctx, input }) => PackageDAL.for(ctx.user).update(input)),
    remove: protectedProcedure.input(byId).mutation(({ ctx, input }) => PackageDAL.for(ctx.user).remove(input.id)),
    listByListing: protectedProcedure
      .input(z.object({ listingId: z.uuid() }))
      .query(({ ctx, input }) => PackageDAL.for(ctx.user).listByListing(input.listingId)),
  }),
  video: createTRPCRouter({
    add: protectedProcedure
      .input(z.object({ listingId: z.uuid(), url: z.url() }))
      .mutation(({ ctx, input }) => VideoDAL.for(ctx.user).add(input.listingId, input.url)),
    remove: protectedProcedure.input(byId).mutation(({ ctx, input }) => VideoDAL.for(ctx.user).remove(input.id)),
    listByListing: protectedProcedure
      .input(z.object({ listingId: z.uuid() }))
      .query(({ ctx, input }) => VideoDAL.for(ctx.user).listByListing(input.listingId)),
  }),
});

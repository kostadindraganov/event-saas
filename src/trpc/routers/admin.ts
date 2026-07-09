import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createTRPCRouter, adminProcedure } from "../init";
import { AdminDAL } from "@/data/admin/admin.dal";
import {
  BillingSettingsSchema,
  CategoryCreateSchema,
  CategoryUpdateSchema,
  AttributeDefinitionCreateSchema,
  AttributeDefinitionUpdateSchema,
  RegionCreateSchema,
  RegionUpdateSchema,
  CityCreateSchema,
  CityUpdateSchema,
  ReportResolveSchema,
  AdminPaginationSchema,
} from "@/data/admin/admin.dto";

const byId = z.object({ id: z.uuid() });
const byUserId = z.object({ id: z.string().min(1) }); // user.id е text, не uuid (auth.ts)

function revalidateListings() {
  revalidateTag("listings", { expire: 0 });
}

export const adminRouter = createTRPCRouter({
  dashboard: createTRPCRouter({
    stats: adminProcedure.query(() => AdminDAL.dashboardStats()),
  }),

  listing: createTRPCRouter({
    list: adminProcedure
      .input(z.object({ status: z.enum(["pending_approval", "published"]) }).extend(AdminPaginationSchema.shape))
      .query(({ input }) => AdminDAL.listListings(input)),
    approve: adminProcedure.input(byId).mutation(async ({ input }) => {
      const r = await AdminDAL.approve(input.id);
      revalidateListings();
      revalidateTag(`listing:${r.slug}`, { expire: 0 });
      return r;
    }),
    reject: adminProcedure
      .input(z.object({ id: z.uuid(), reason: z.string().min(1).max(500) }))
      .mutation(async ({ input }) => {
        const r = await AdminDAL.reject(input.id, input.reason);
        revalidateListings();
        revalidateTag(`listing:${r.slug}`, { expire: 0 });
        return r;
      }),
    remove: adminProcedure.input(byId).mutation(async ({ input }) => {
      const r = await AdminDAL.remove(input.id);
      revalidateListings();
      revalidateTag(`listing:${r.slug}`, { expire: 0 });
      return r;
    }),
  }),

  user: createTRPCRouter({
    list: adminProcedure.input(AdminPaginationSchema).query(({ input }) => AdminDAL.listUsers(input)),
    setAdmin: adminProcedure
      .input(byUserId.extend({ isAdmin: z.boolean() }))
      .mutation(({ ctx, input }) => AdminDAL.setAdmin(ctx.user.id, input.id, input.isAdmin)),
    block: adminProcedure
      .input(byUserId)
      .mutation(({ ctx, input }) => AdminDAL.blockUser(ctx.user.id, input.id)),
    unblock: adminProcedure.input(byUserId).mutation(({ input }) => AdminDAL.unblockUser(input.id)),
  }),

  settings: createTRPCRouter({
    get: adminProcedure.query(() => AdminDAL.getSettings()),
    // некеширани settings (реш. 9) → без revalidate
    update: adminProcedure.input(BillingSettingsSchema).mutation(({ input }) => AdminDAL.updateSettings(input)),
  }),

  taxonomy: createTRPCRouter({
    category: createTRPCRouter({
      list: adminProcedure.query(() => AdminDAL.listCategoriesAdmin()),
      create: adminProcedure.input(CategoryCreateSchema).mutation(async ({ input }) => {
        const r = await AdminDAL.createCategory(input);
        revalidateListings();
        return r;
      }),
      // isActive в input покрива soft-delete toggle-a (CategoryUpdateSchema)
      update: adminProcedure.input(CategoryUpdateSchema).mutation(async ({ input }) => {
        await AdminDAL.updateCategory(input);
        revalidateListings();
      }),
    }),

    attribute: createTRPCRouter({
      listByCategory: adminProcedure
        .input(z.object({ categoryId: z.uuid() }))
        .query(({ input }) => AdminDAL.listByCategoryAdmin(input.categoryId)),
      create: adminProcedure.input(AttributeDefinitionCreateSchema).mutation(async ({ input }) => {
        const r = await AdminDAL.createAttributeDefinition(input);
        revalidateListings();
        return r;
      }),
      update: adminProcedure.input(AttributeDefinitionUpdateSchema).mutation(async ({ input }) => {
        await AdminDAL.updateAttributeDefinition(input);
        revalidateListings();
      }),
      remove: adminProcedure.input(byId).mutation(async ({ input }) => {
        await AdminDAL.deleteAttributeDefinition(input.id);
        revalidateListings();
        return { ok: true as const };
      }),
    }),

    region: createTRPCRouter({
      list: adminProcedure.query(() => AdminDAL.listRegions()),
      create: adminProcedure.input(RegionCreateSchema).mutation(async ({ input }) => {
        const r = await AdminDAL.createRegion(input);
        revalidateListings();
        return r;
      }),
      update: adminProcedure.input(RegionUpdateSchema).mutation(async ({ input }) => {
        await AdminDAL.updateRegion(input);
        revalidateListings();
      }),
      remove: adminProcedure.input(byId).mutation(async ({ input }) => {
        await AdminDAL.deleteRegion(input.id);
        revalidateListings();
        return { ok: true as const };
      }),
    }),

    city: createTRPCRouter({
      listByRegion: adminProcedure
        .input(z.object({ regionId: z.uuid() }))
        .query(({ input }) => AdminDAL.listCitiesByRegion(input.regionId)),
      create: adminProcedure.input(CityCreateSchema).mutation(async ({ input }) => {
        const r = await AdminDAL.createCity(input);
        revalidateListings();
        return r;
      }),
      update: adminProcedure.input(CityUpdateSchema).mutation(async ({ input }) => {
        await AdminDAL.updateCity(input);
        revalidateListings();
      }),
      remove: adminProcedure.input(byId).mutation(async ({ input }) => {
        await AdminDAL.deleteCity(input.id);
        revalidateListings();
        return { ok: true as const };
      }),
    }),
  }),

  report: createTRPCRouter({
    list: adminProcedure.query(() => AdminDAL.listReports()),
    resolve: adminProcedure.input(ReportResolveSchema).mutation(({ input }) => AdminDAL.resolveReport(input)),
  }),
});

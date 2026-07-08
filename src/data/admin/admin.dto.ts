import { z } from "zod";

export const BillingSettingsSchema = z.object({
  limits: z.object({
    standard: z.number().int().min(0),
    premiumPerCategory: z.number().int().min(0),
  }),
  graceDays: z.number().int().min(0),
  promo: z.object({
    durationDays: z.number().int().min(1),
    premiumSlots: z.number().int().min(0),
    carouselSize: z.number().int().min(0),
  }),
});
export type BillingSettingsInput = z.infer<typeof BillingSettingsSchema>;
// alias за UI-я (Задача 16 импортира `type BillingSettings` от admin.dto.ts)
export type BillingSettings = z.infer<typeof BillingSettingsSchema>;

// Admin-only DTO: email е легитимен тук (админ управлява потребители). Не се излага публично.
export type AdminUserDTO = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  deletedAt: string | null;
};

export type AdminListingRowDTO = {
  id: string;
  title: string;
  status: "pending_approval" | "published";
  categoryNameBg: string;
  categoryNameEn: string;
  cityName: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  rejectionReason: string | null;
};

export type AdminDashboardStatsDTO = {
  pendingListings: number;
  publishedListings: number;
  users: number;
  activeSubscriptions: number;
  activePromotions: number;
};

export type CategoryRowDTO = {
  id: string;
  slug: string;
  nameBg: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
};

const slugField = z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "SLUG_FORMAT");

const categoryFields = {
  slug: slugField,
  nameBg: z.string().min(1).max(100),
  nameEn: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
};

export const CategoryCreateSchema = z.object(categoryFields);
// isActive в update покрива soft-delete toggle-а през category.update (shape/UI Задача 17)
export const CategoryUpdateSchema = z
  .object(categoryFields)
  .partial()
  .extend({ id: z.uuid(), isActive: z.boolean().optional() });
export type CategoryCreateInput = z.infer<typeof CategoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof CategoryUpdateSchema>;

export const AttributeOptionInputSchema = z.object({
  value: z.string().min(1).max(60),
  labelBg: z.string().min(1).max(100),
  labelEn: z.string().min(1).max(100),
});

const attributeDefFields = {
  categoryId: z.uuid(),
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, "KEY_FORMAT"),
  labelBg: z.string().min(1).max(100),
  labelEn: z.string().min(1).max(100),
  type: z.enum(["single", "multi", "number", "boolean"]),
  options: z.array(AttributeOptionInputSchema).nullable(),
  showAsFilter: z.boolean(),
  showAsChip: z.boolean(),
  sortOrder: z.number().int().min(0),
};

// single/multi изискват непразни options; number/boolean → options === null
const optionsMatchType = (d: { type: string; options: unknown[] | null }) =>
  d.type === "single" || d.type === "multi"
    ? Array.isArray(d.options) && d.options.length > 0
    : d.options === null;
const optionsMsg = { message: "OPTIONS_TYPE_MISMATCH", path: ["options"] };

export const AttributeDefinitionCreateSchema = z.object(attributeDefFields).refine(optionsMatchType, optionsMsg);
export const AttributeDefinitionUpdateSchema = z
  .object({ id: z.uuid(), ...attributeDefFields })
  .refine(optionsMatchType, optionsMsg);
export type AttributeDefinitionCreateInput = z.infer<typeof AttributeDefinitionCreateSchema>;
export type AttributeDefinitionUpdateInput = z.infer<typeof AttributeDefinitionUpdateSchema>;

export type RegionRowDTO = { id: string; slug: string; name: string };
export type CityRowDTO = { id: string; regionId: string; slug: string; name: string };

const regionFields = {
  slug: slugField, // reuse от Задача 9
  name: z.string().min(1).max(100),
};
export const RegionCreateSchema = z.object(regionFields);
export const RegionUpdateSchema = z.object({ id: z.uuid(), ...regionFields });
export type RegionCreateInput = z.infer<typeof RegionCreateSchema>;
export type RegionUpdateInput = z.infer<typeof RegionUpdateSchema>;

const cityFields = {
  regionId: z.uuid(),
  slug: slugField,
  name: z.string().min(1).max(100),
};
export const CityCreateSchema = z.object(cityFields);
export const CityUpdateSchema = z.object({ id: z.uuid(), ...cityFields });
export type CityCreateInput = z.infer<typeof CityCreateSchema>;
export type CityUpdateInput = z.infer<typeof CityUpdateSchema>;

export type ReportRowDTO = {
  id: string;
  targetType: "review" | "question" | "listing";
  targetId: string;
  reason: string;
  reporterEmail: string;
  createdAt: string;
  targetExcerpt: string | null; // review.title / question.body[:80] / listing.title; null ако изтрит
  targetListingSlug: string | null; // за revalidate при resolve
};

export const ReportResolveSchema = z.object({
  id: z.uuid(),
  action: z.enum(["hide", "remove", "dismiss"]),
  resolution: z.string().max(1000).optional(),
});
export type ReportResolveInput = z.infer<typeof ReportResolveSchema>;

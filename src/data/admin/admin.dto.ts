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

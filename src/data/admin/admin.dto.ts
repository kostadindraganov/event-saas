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

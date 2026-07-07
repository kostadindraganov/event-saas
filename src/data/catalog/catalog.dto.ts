import { z } from "zod";

export const ListingCreateInputSchema = z.object({
  title: z.string().min(3).max(120),
  categoryId: z.uuid(),
  cityId: z.uuid(),
});
export type ListingCreateInput = z.infer<typeof ListingCreateInputSchema>;

export const ListingUpdateInputSchema = z.object({
  id: z.uuid(),
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(8000).optional(),
  cityId: z.uuid().optional(),
  wholeCountry: z.boolean().optional(),
  serviceRegionIds: z.array(z.uuid()).max(28).optional(),
});
export type ListingUpdateInput = z.infer<typeof ListingUpdateInputSchema>;

export const ListingStatusSchema = z.enum([
  "draft", "pending_approval", "published", "hidden", "rejected", "removed",
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

export const ListingDTOSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  status: ListingStatusSchema,
  categoryId: z.uuid(),
  cityId: z.uuid(),
  wholeCountry: z.boolean(),
  serviceRegionIds: z.array(z.uuid()),
  priceFromCents: z.number().int().nullable(),
  coverImageId: z.uuid().nullable(),
  rejectionReason: z.string().nullable(),
  publishedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type ListingDTO = z.infer<typeof ListingDTOSchema>;

export type ListingSummaryDTO = Pick<
  ListingDTO,
  "id" | "slug" | "title" | "status" | "categoryId" | "cityId" | "priceFromCents" | "coverImageId" | "rejectionReason"
>;

export const PackageInputSchema = z.object({
  listingId: z.uuid(),
  name: z.string().min(2).max(80),
  priceFromCents: z.number().int().positive(),
  duration: z.string().max(80).optional(),
  included: z.string().max(2000).optional(),
});
export type PackageInput = z.infer<typeof PackageInputSchema>;

export const PackageDTOSchema = z.object({
  id: z.uuid(),
  listingId: z.uuid(),
  name: z.string(),
  priceFromCents: z.number().int(),
  duration: z.string().nullable(),
  included: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type PackageDTO = z.infer<typeof PackageDTOSchema>;

import { z } from "zod";

export type SubscriptionDTO = {
  plan: "standard" | "premium";
  status: "active" | "past_due" | "canceled" | "revoked";
  currentPeriodEnd: string | null; // ISO
  graceUntil: string | null; // ISO
};

// ponytail: единично categoryName (не bg/en двойка) по contract.md; locale-ът се подава
// изрично в BillingDAL.mine(locale) — виж резолвнато решение #1 в началото на секцията.
export type SystemHiddenListingDTO = {
  id: string;
  title: string;
  categoryName: string;
};

export type BillingOverviewDTO = {
  subscription: SubscriptionDTO | null;
  systemHidden: SystemHiddenListingDTO[];
};

// DTO хигиена: без polarOrderId (contract т.13) — клиентът вижда само активна/неактивна + краен срок.
export type MyPromotionListingDTO = {
  id: string;
  title: string;
  categoryName: string;
  status: "published" | "hidden";
  promoActive: boolean;
  promoEndsAt: string | null; // ISO
};

// Zod на външния Polar seam (ADR-0002 дисциплината, приложена и към webhooks): само полетата,
// които проекцията реално ползва. Несъответствие на формата → safeParse fail → log+skip в lib/auth.ts,
// така предположението за shape-а е проверимо на runtime (и тестваемо с реални payload-и).
export const PolarSubscriptionEventSchema = z.object({
  customer: z.object({ externalId: z.string().nullable() }).nullish(),
  data: z.object({
    id: z.string(),
    status: z.string(),
    currentPeriodEnd: z.union([z.string(), z.date()]).nullish(),
    productId: z.string(),
  }),
});
export type PolarSubscriptionEventPayload = z.infer<typeof PolarSubscriptionEventSchema>;

export const PolarOrderPaidSchema = z.object({
  customer: z.object({ externalId: z.string().nullable() }).nullish(),
  data: z.object({
    id: z.string(),
    productId: z.string(),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  }),
});
export type PolarOrderPaidPayload = z.infer<typeof PolarOrderPaidSchema>;

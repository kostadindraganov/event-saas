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

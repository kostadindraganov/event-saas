type PolicyUser = { id: string; isAdmin: boolean };

export type ListingStatus = "draft" | "pending_approval" | "published" | "hidden" | "rejected" | "removed";

// Обява lifecycle: единствената таблица на легалните преходи. DAL-овете (listing/admin/billing)
// извличат CAS "from" set-овете си оттук вместо да ги копират в WHERE клаузи.
// Системният hide/restore (billing) следва същите преходи като owner hide/unhide.
export const LISTING_TRANSITIONS: Record<
  "submit" | "approve" | "reject" | "hide" | "unhide" | "remove",
  { from: ListingStatus[]; to: ListingStatus }
> = {
  submit: { from: ["draft", "rejected"], to: "pending_approval" },
  approve: { from: ["pending_approval"], to: "published" },
  reject: { from: ["pending_approval"], to: "rejected" },
  hide: { from: ["published"], to: "hidden" },
  unhide: { from: ["hidden"], to: "published" },
  remove: { from: ["published", "hidden"], to: "removed" },
};

export function canCreateListing(user: PolicyUser | null): boolean {
  // ponytail: Ф1 — всеки логнат; entitlement лимитите идват с billing във Ф2
  return user !== null;
}

export function canEditListing(
  user: PolicyUser | null,
  listing: { ownerId: string },
): boolean {
  if (!user) return false;
  return user.id === listing.ownerId || user.isAdmin;
}

export function canSubmitListing(
  user: PolicyUser | null,
  listing: { ownerId: string; status: string },
): boolean {
  if (!user || user.id !== listing.ownerId) return false;
  return (LISTING_TRANSITIONS.submit.from as string[]).includes(listing.status);
}

type PolicyUser = { id: string; isAdmin: boolean };

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
  return listing.status === "draft" || listing.status === "rejected";
}

import type { BookingStatus } from "./booking.dto";

type PolicyUser = { id: string; isAdmin: boolean };

export function canManageCalendar(user: PolicyUser | null, listingOwnerId: string): boolean {
  if (!user) return false;
  return user.id === listingOwnerId || user.isAdmin;
}

export function canModerateBooking(user: PolicyUser | null, listingOwnerId: string): boolean {
  if (!user) return false;
  return user.id === listingOwnerId || user.isAdmin;
}

const CANCELLABLE_STATUSES: BookingStatus[] = ["pending", "confirmed"];

export function canCancelBooking(
  user: PolicyUser | null,
  b: { customerId: string; listingOwnerId: string; status: BookingStatus },
): "customer" | "vendor" | null {
  if (!user) return null;
  if (!CANCELLABLE_STATUSES.includes(b.status)) return null;
  if (user.id === b.customerId) return "customer";
  if (user.id === b.listingOwnerId || user.isAdmin) return "vendor";
  return null;
}

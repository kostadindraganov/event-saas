import "server-only";
import { and, avg, count, eq } from "drizzle-orm";
import { review, listing } from "@/db/schema";
import type { Transaction } from "@/data/billing/billing.dal";

// Recompute rating_avg / review_count от VISIBLE ревюта. Вика се В ТРАНЗАКЦИЯ.
// 0 visible → ratingAvg=null, reviewCount=0.
export async function recomputeListingRating(tx: Transaction, listingId: string): Promise<void> {
  const [agg] = await tx
    .select({ a: avg(review.ratingOverall), c: count() })
    .from(review)
    .where(and(eq(review.listingId, listingId), eq(review.status, "visible")));
  const c = agg?.c ?? 0;
  await tx.update(listing).set({
    reviewCount: c,
    ratingAvg: c > 0 && agg?.a != null ? String(Number(agg.a).toFixed(2)) : null,
  }).where(eq(listing.id, listingId));
}

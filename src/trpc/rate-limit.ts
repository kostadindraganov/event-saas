import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "@/trpc/init";

// ponytail: in-memory, per-инстанция; при multi-instance deploy → споделен store (Redis). Ceiling приет за M3.3.
const hits = new Map<string, number[]>();

export function checkRateLimit(action: string, userId: string, limit: number, windowMs: number): void {
  const key = `${action}:${userId}`;
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "TOO_MANY_REQUESTS" });
  arr.push(now);
  hits.set(key, arr);
}

export function rateLimited(action: string, limit: number, windowMs: number) {
  return protectedProcedure.use(({ ctx, next }) => {
    checkRateLimit(action, ctx.user.id, limit, windowMs);
    return next({ ctx: { user: ctx.user } });
  });
}

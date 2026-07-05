import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { SessionUser } from "@/data/users/require-user";

export type TRPCContext = { user: SessionUser | null };

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isAdmin) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

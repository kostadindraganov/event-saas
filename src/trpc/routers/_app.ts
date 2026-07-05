import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";

export const appRouter = createTRPCRouter({
  health: createTRPCRouter({
    ping: publicProcedure.query(() => ({ ok: true as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id })),
  }),
});

export type AppRouter = typeof appRouter;

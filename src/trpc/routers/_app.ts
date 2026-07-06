import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { catalogRouter } from "./catalog";
import { mediaRouter } from "./media";

export const appRouter = createTRPCRouter({
  health: createTRPCRouter({
    ping: publicProcedure.query(() => ({ ok: true as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id })),
  }),
  catalog: catalogRouter,
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;

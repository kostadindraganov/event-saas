import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { catalogRouter } from "./catalog";
import { mediaRouter } from "./media";
import { savedRouter } from "./saved";

export const appRouter = createTRPCRouter({
  health: createTRPCRouter({
    ping: publicProcedure.query(() => ({ ok: true as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id })),
  }),
  catalog: catalogRouter,
  media: mediaRouter,
  saved: savedRouter,
});

export type AppRouter = typeof appRouter;

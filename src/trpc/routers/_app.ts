import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { accountRouter } from "./account";
import { catalogRouter } from "./catalog";
import { mediaRouter } from "./media";
import { savedRouter } from "./saved";
import { messagingRouter } from "./messaging";
import { billingRouter } from "./billing";
import { adminRouter } from "./admin";
import { bookingRouter } from "./booking";
import { reviewRouter } from "./review";
import { qaRouter } from "./qa";
import { reportRouter } from "./report";

export const appRouter = createTRPCRouter({
  health: createTRPCRouter({
    ping: publicProcedure.query(() => ({ ok: true as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id })),
  }),
  catalog: catalogRouter,
  media: mediaRouter,
  saved: savedRouter,
  messaging: messagingRouter,
  billing: billingRouter,
  admin: adminRouter,
  booking: bookingRouter,
  review: reviewRouter,
  qa: qaRouter,
  report: reportRouter,
  account: accountRouter,
});

export type AppRouter = typeof appRouter;

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { MessagingDAL } from "@/data/messaging/messaging.dal";

export const messagingRouter = createTRPCRouter({
  createInquiry: protectedProcedure
    .input(z.object({
      listingId: z.uuid(),
      body: z.string().trim().min(1).max(2000),
      eventDate: z.iso.date().optional(),
      phone: z.string().trim().max(30).optional(),
    }))
    .mutation(({ ctx, input }) => MessagingDAL.for(ctx.user).createInquiry(input)),
  listThreads: protectedProcedure.query(({ ctx }) => MessagingDAL.for(ctx.user).listThreads()),
  getThread: protectedProcedure
    .input(z.object({ threadId: z.uuid() }))
    .query(({ ctx, input }) => MessagingDAL.for(ctx.user).getThread(input.threadId)),
  sendMessage: protectedProcedure
    .input(z.object({ threadId: z.uuid(), body: z.string().trim().min(1).max(2000) }))
    .mutation(({ ctx, input }) => MessagingDAL.for(ctx.user).sendMessage(input.threadId, input.body)),
  markRead: protectedProcedure
    .input(z.object({ threadId: z.uuid() }))
    .mutation(({ ctx, input }) => MessagingDAL.for(ctx.user).markRead(input.threadId)),
  unreadCount: protectedProcedure.query(({ ctx }) => MessagingDAL.for(ctx.user).unreadCount()),
});

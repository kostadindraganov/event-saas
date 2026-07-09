import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import { AccountDAL } from "@/data/account/account.dal";

export const accountRouter = createTRPCRouter({
  delete: protectedProcedure
    .input(z.object({ confirmation: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.confirmation !== "ИЗТРИЙ") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CONFIRMATION_MISMATCH" });
      }
      await AccountDAL.eraseAccount(ctx.user.id);
      return { ok: true as const };
    }),
});

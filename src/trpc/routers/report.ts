import { createTRPCRouter, protectedProcedure } from "../init";
import { ReportDAL, ReportCreateSchema } from "@/data/reviews/report.dal";

export const reportRouter = createTRPCRouter({
  create: protectedProcedure.input(ReportCreateSchema).mutation(({ ctx, input }) => ReportDAL.for(ctx.user).create(input)),
});

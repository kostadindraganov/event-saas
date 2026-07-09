import { createTRPCRouter } from "../init";
import { rateLimited } from "../rate-limit";
import { ReportDAL, ReportCreateSchema } from "@/data/reviews/report.dal";

export const reportRouter = createTRPCRouter({
  create: rateLimited("report.create", 10, 3_600_000).input(ReportCreateSchema).mutation(({ ctx, input }) => ReportDAL.for(ctx.user).create(input)),
});

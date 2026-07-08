import "server-only";
import { z } from "zod";
import { db } from "@/db";
import { report } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";

export const ReportCreateSchema = z.object({
  targetType: z.enum(["review", "question", "listing"]),
  targetId: z.uuid(),
  reason: z.string().min(3).max(1000),
});
export type ReportCreateInput = z.infer<typeof ReportCreateSchema>;

export class ReportDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser): ReportDAL {
    return new ReportDAL(user);
  }

  // protected; insert report status='open'. Без dedup guard V1 (contract D6).
  async create(input: ReportCreateInput): Promise<{ id: string }> {
    const [row] = await db
      .insert(report)
      .values({
        targetType: input.targetType,
        targetId: input.targetId,
        reporterId: this.user.id,
        reason: input.reason,
      })
      .returning({ id: report.id });
    return row!;
  }
}

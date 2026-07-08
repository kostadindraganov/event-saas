import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { ReportDAL } from "./report.dal";
import {
  createTestUser, cleanupTestUser, createTestListing, getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

test("create: insert report status='open' с targetType/targetId/reason запазени; без dedup — втори доклад от друг user succeeds", async () => {
  const owner = await createTestUser();
  cleanupIds.push(owner.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const target = await createTestListing(owner.id, { status: "published", categoryId, cityId });

  const reporterA = await createTestUser();
  cleanupIds.push(reporterA.id);
  const userA: SessionUser = { id: reporterA.id, email: reporterA.email, name: "А", isAdmin: false };
  const r1 = await ReportDAL.for(userA).create({ targetType: "listing", targetId: target.id, reason: "Подвеждаща обява" });

  const [row] = await testDb.select().from(schema.report).where(eq(schema.report.id, r1.id));
  expect(row?.status).toBe("open");
  expect(row?.targetType).toBe("listing");
  expect(row?.targetId).toBe(target.id);
  expect(row?.reason).toBe("Подвеждаща обява");

  const reporterB = await createTestUser();
  cleanupIds.push(reporterB.id);
  const userB: SessionUser = { id: reporterB.id, email: reporterB.email, name: "Б", isAdmin: false };
  const r2 = await ReportDAL.for(userB).create({ targetType: "listing", targetId: target.id, reason: "Спам" });
  expect(r2.id).not.toBe(r1.id); // D6: без dedup guard V1 — вторият доклад за същата цел също се записва

  // report.reporterId FK → user (без cascade) — трий преди cleanupTestUser
  await testDb.delete(schema.report).where(eq(schema.report.reporterId, reporterA.id));
  await testDb.delete(schema.report).where(eq(schema.report.reporterId, reporterB.id));
});

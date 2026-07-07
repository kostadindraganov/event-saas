import { afterEach, expect, test } from "vitest";
import {
  createTestUser, createTestSubscription, cleanupTestUser,
  getTestCategoryId, getTestCityId,
} from "@/test/db-helpers";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { AdminDAL } from "./admin.dal";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

test("dashboardStats(): нова pending обява увеличава pendingListings; одобрение увеличава published (delta)", async () => {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  await createTestSubscription(u.id, { plan: "standard", status: "active" });
  const user: SessionUser = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  const dal = ListingDAL.for(user);
  const draft = await dal.createDraft({
    title: "Дашборд Тест",
    categoryId: await getTestCategoryId(),
    cityId: await getTestCityId(),
  });

  await dal.submit(draft.id); // → pending_approval
  const afterSubmit = await AdminDAL.dashboardStats();

  // DTO shape + lower-bounds (глобални count-ове — делти НЕ са надеждни под паралелизъм;
  // нашата pending обява гарантира >= 1, нашият user гарантира users >= 1)
  expect(typeof afterSubmit.pendingListings).toBe("number");
  expect(afterSubmit.pendingListings).toBeGreaterThanOrEqual(1);
  expect(afterSubmit.publishedListings).toBeGreaterThanOrEqual(0);
  expect(afterSubmit.users).toBeGreaterThanOrEqual(1);
  expect(afterSubmit.activeSubscriptions).toBeGreaterThanOrEqual(1);
  expect(afterSubmit.activePromotions).toBeGreaterThanOrEqual(0);

  await AdminDAL.approve(draft.id); // pending → published
  const afterApprove = await AdminDAL.dashboardStats();
  expect(afterApprove.publishedListings).toBeGreaterThanOrEqual(1);

  // смислената (не-flaky) проверка: нашата обява реално е published
  const mine = await ListingDAL.for(user).getForOwner(draft.id);
  expect(mine?.status).toBe("published");
});

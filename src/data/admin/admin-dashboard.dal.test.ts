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

  const beforeSubmit = await AdminDAL.dashboardStats();
  await dal.submit(draft.id); // → pending_approval
  const afterSubmit = await AdminDAL.dashboardStats();

  // нова pending обява увеличава pendingListings (мин. очаквана промяна)
  expect(afterSubmit.pendingListings).toBeGreaterThanOrEqual(beforeSubmit.pendingListings + 1);

  const beforeApprove = await AdminDAL.dashboardStats();
  await AdminDAL.approve(draft.id); // pending → published
  const afterApprove = await AdminDAL.dashboardStats();

  // одобрението увеличава published (мин. очаквана промяна)
  expect(afterApprove.publishedListings).toBeGreaterThanOrEqual(beforeApprove.publishedListings + 1);
});

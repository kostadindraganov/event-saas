import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestUser, createTestSubscription, cleanupTestUser,
  getTestCategoryId, getTestCityId, testDb,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { AdminDAL } from "./admin.dal";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function newOwner(plan: "standard" | "premium" = "standard"): Promise<{ user: SessionUser; id: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  await createTestSubscription(u.id, { plan, status: "active" });
  return { user: { id: u.id, email: u.email, name: "Тест", isAdmin: false }, id: u.id };
}

test("approve(): pending → published, сетва publishedAt, нулира rejectionReason", async () => {
  const { user } = await newOwner();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(user);
  const draft = await dal.createDraft({ title: "Одобрение Тест", categoryId, cityId });
  await dal.submit(draft.id); // → pending_approval (Задача 3)

  await AdminDAL.approve(draft.id);

  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, draft.id));
  expect(row?.status).toBe("published");
  expect(row?.publishedAt).not.toBeNull();
  expect(row?.rejectionReason).toBeNull();
});

test("approve(): standard over-limit — 2 pending, approve 2-рата → LIMIT_REACHED, остава pending", async () => {
  const { user } = await newOwner("standard");
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(user);

  // и двете submit-нати докато published=0 → submit pre-check ги пуска като pending
  const a = await dal.createDraft({ title: "Овърлимит А", categoryId, cityId });
  await dal.submit(a.id);
  const b = await dal.createDraft({ title: "Овърлимит Б", categoryId, cityId });
  await dal.submit(b.id);

  await AdminDAL.approve(a.id); // консумира единствения standard слот

  await expect(AdminDAL.approve(b.id)).rejects.toThrow("LIMIT_REACHED");
  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, b.id));
  expect(row?.status).toBe("pending_approval"); // остава pending, без auto-reject
});

test("reject(): pending → rejected + rejectionReason (вендорът вижда причината)", async () => {
  const { user } = await newOwner();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(user);
  const draft = await dal.createDraft({ title: "Отказ Тест", categoryId, cityId });
  await dal.submit(draft.id);

  await AdminDAL.reject(draft.id, "Липсват снимки");

  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, draft.id));
  expect(row?.status).toBe("rejected");
  expect(row?.rejectionReason).toBe("Липсват снимки");
  // вендорът чете причината през getForOwner (rejectionReason е в ListingDTO)
  const dto = await dal.getForOwner(draft.id);
  expect(dto.rejectionReason).toBe("Липсват снимки");
});

test("remove(): published → removed (без owner филтър)", async () => {
  const { user } = await newOwner();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(user);
  const draft = await dal.createDraft({ title: "Премахване Тест", categoryId, cityId });
  await dal.submit(draft.id);
  await AdminDAL.approve(draft.id);

  await AdminDAL.remove(draft.id);

  const [row] = await testDb.select().from(schema.listing).where(eq(schema.listing.id, draft.id));
  expect(row?.status).toBe("removed");
});

test("listListings({status}): връща pending, не published — id-scoped", async () => {
  const { user } = await newOwner();
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(user);
  const pending = await dal.createDraft({ title: "Списък Pending", categoryId, cityId });
  await dal.submit(pending.id);
  const published = await dal.createDraft({ title: "Списък Published", categoryId, cityId });
  await dal.submit(published.id);
  await AdminDAL.approve(published.id);

  const rows = await AdminDAL.listListings({ status: "pending_approval" });
  expect(rows.some((r) => r.id === pending.id)).toBe(true);
  expect(rows.some((r) => r.id === published.id)).toBe(false);
});

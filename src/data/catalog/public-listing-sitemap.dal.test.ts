import { afterAll, beforeAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestUser, cleanupTestUser, getTestCityId, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { ListingDAL } from "./listing.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let ownerId: string, categoryId: string, cityId: string;
let publishedSlug: string, draftSlug: string;

beforeAll(async () => {
  const u = await createTestUser();
  ownerId = u.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  const [cat] = await testDb.select().from(schema.category).where(eq(schema.category.slug, "fotografi"));
  categoryId = cat!.id;
  cityId = await getTestCityId();
  const dal = ListingDAL.for(owner);

  const l = await dal.createDraft({ title: "Sitemap Публична Обява", categoryId, cityId });
  publishedSlug = l.slug;
  await dal.update({ id: l.id, description: "Описание.", wholeCountry: true });
  await dal.submit(l.id); // draft → published

  const d = await dal.createDraft({ title: "Sitemap Чернова Обява", categoryId, cityId });
  draftSlug = d.slug;
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
});

test("sitemapEntries: включва публикуваната обява, не и чернова", async () => {
  const entries = await ListingDAL.public().sitemapEntries(0, 50_000);
  expect(entries.some((e) => e.slug === publishedSlug)).toBe(true);
  expect(entries.some((e) => e.slug === draftSlug)).toBe(false);
});

test("publishedCount: > 0 когато има публикувана обява", async () => {
  const count = await ListingDAL.public().publishedCount();
  expect(count).toBeGreaterThan(0);
});

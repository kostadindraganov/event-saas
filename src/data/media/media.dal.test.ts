import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestUser, cleanupTestUser, getTestCategoryId, getTestCityId } from "@/test/db-helpers";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { MediaDAL } from "./media.dal";
import type { SessionUser } from "@/data/users/require-user";

let owner: SessionUser;
let stranger: SessionUser;
let ownerId: string, strangerId: string, listingId: string;

beforeAll(async () => {
  const u = await createTestUser();
  const u2 = await createTestUser();
  ownerId = u.id;
  strangerId = u2.id;
  owner = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  stranger = { id: u2.id, email: u2.email, name: "Друг", isAdmin: false };
  const l = await ListingDAL.for(owner).createDraft({
    title: "Медия Тест", categoryId: await getTestCategoryId(), cityId: await getTestCityId(),
  });
  listingId = l.id;
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
  await cleanupTestUser(strangerId);
});

test("listByListing: чужд потребител → FORBIDDEN", async () => {
  await expect(MediaDAL.for(stranger).listByListing(listingId)).rejects.toThrow("FORBIDDEN");
});

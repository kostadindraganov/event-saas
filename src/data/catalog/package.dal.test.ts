import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestUser, cleanupTestUser, getTestCategoryId, getTestCityId } from "@/test/db-helpers";
import { ListingDAL } from "./listing.dal";
import { PackageDAL, VideoDAL } from "./package.dal";
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
    title: "Пакети Тест", categoryId: await getTestCategoryId(), cityId: await getTestCityId(),
  });
  listingId = l.id;
});

afterAll(async () => {
  await cleanupTestUser(ownerId);
  await cleanupTestUser(strangerId);
});

test("create/update/remove преизчислява priceFromCents", async () => {
  const pkgs = PackageDAL.for(owner);
  await pkgs.create({ listingId, name: "Стандарт", priceFromCents: 150000 });
  await pkgs.create({ listingId, name: "Промо", priceFromCents: 90000 });
  let l = await ListingDAL.for(owner).getForOwner(listingId);
  expect(l.priceFromCents).toBe(90000);

  const list = await pkgs.listByListing(listingId);
  const promo = list.find((p) => p.name === "Промо")!;
  await pkgs.remove(promo.id);
  l = await ListingDAL.for(owner).getForOwner(listingId);
  expect(l.priceFromCents).toBe(150000);
});

test("видео: валиден URL се добавя, невалиден → INVALID_YOUTUBE_URL", async () => {
  const videos = VideoDAL.for(owner);
  await videos.add(listingId, "https://youtu.be/dQw4w9WgXcQ");
  expect((await videos.listByListing(listingId))[0]?.youtubeId).toBe("dQw4w9WgXcQ");
  await expect(videos.add(listingId, "https://vimeo.com/1")).rejects.toThrow("INVALID_YOUTUBE_URL");
});

test("listByListing: чужд потребител → FORBIDDEN (package и video)", async () => {
  await expect(PackageDAL.for(stranger).listByListing(listingId)).rejects.toThrow("FORBIDDEN");
  await expect(VideoDAL.for(stranger).listByListing(listingId)).rejects.toThrow("FORBIDDEN");
});

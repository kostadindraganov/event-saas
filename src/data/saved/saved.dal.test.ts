import { afterAll, beforeAll, expect, test } from "vitest";
import { createTestUser, cleanupTestUser, getTestCategoryId, getTestCityId } from "@/test/db-helpers";
import { ListingDAL } from "@/data/catalog/listing.dal";
import { SavedDAL } from "./saved.dal";
import type { SessionUser } from "@/data/users/require-user";

let me: SessionUser, owner: SessionUser;
let meId: string, ownerId: string;
let publishedId: string, hiddenId: string;

beforeAll(async () => {
  const u1 = await createTestUser();
  const u2 = await createTestUser();
  meId = u1.id;
  ownerId = u2.id;
  me = { id: u1.id, email: u1.email, name: "Клиент", isAdmin: false };
  owner = { id: u2.id, email: u2.email, name: "Вендор", isAdmin: false };
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const dal = ListingDAL.for(owner);
  const pub = await dal.createDraft({ title: "Избрана Обява", categoryId, cityId });
  await dal.submit(pub.id);
  publishedId = pub.id;
  const hid = await dal.createDraft({ title: "Скрита Избрана", categoryId, cityId });
  await dal.submit(hid.id);
  await dal.hide(hid.id);
  hiddenId = hid.id;
});

afterAll(async () => {
  await cleanupTestUser(meId);
  await cleanupTestUser(ownerId);
});

test("toggle: двупосочно (insert → saved:true, повторно → saved:false)", async () => {
  const dal = SavedDAL.for(me);
  expect(await dal.toggle(publishedId)).toEqual({ saved: true });
  expect(await dal.toggle(publishedId)).toEqual({ saved: false });
});

test("list връща само published + моите; ids съдържа toggle-натите", async () => {
  const dal = SavedDAL.for(me);
  await dal.toggle(publishedId); // saved
  await dal.toggle(hiddenId); // saved, но скрита
  const list = await dal.list();
  const listIds = list.map((c) => c.id);
  expect(listIds).toContain(publishedId);
  expect(listIds).not.toContain(hiddenId); // скритата не се показва
  const ids = await dal.ids();
  expect(ids).toContain(publishedId);
  expect(ids).toContain(hiddenId); // ids не филтрира по статус (state за heart-а)
  // чужд потребител не вижда моите
  expect((await SavedDAL.for(owner).ids())).not.toContain(publishedId);
});

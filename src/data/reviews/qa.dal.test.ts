import { afterEach, expect, test } from "vitest";
import { QaDAL } from "./qa.dal";
import {
  createTestUser, cleanupTestUser, createTestListing, getTestCategoryId, getTestCityId,
} from "@/test/db-helpers";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function ownerWithListing(): Promise<{ user: SessionUser; listingId: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(u.id, { status: "published", categoryId, cityId });
  return { user: { id: u.id, email: u.email, name: "Доставчик", isAdmin: false }, listingId: l.id };
}

test("ask + listByListing: публичен списък връща въпроса, автор име, answerText null преди отговор", async () => {
  const { listingId } = await ownerWithListing();
  const asker = await createTestUser();
  cleanupIds.push(asker.id);
  const askerUser: SessionUser = { id: asker.id, email: asker.email, name: "Питащ", isAdmin: false };

  const q = await QaDAL.for(askerUser).ask({ listingId, body: "Работите ли в неделя?" });

  const listed = await QaDAL.public().listByListing(listingId);
  const row = listed.find((r) => r.id === q.id);
  expect(row?.body).toBe("Работите ли в неделя?");
  // ponytail: createTestUser не приема name override → authorName идва от DB (винаги "Тест
  // Потребител"), не от SessionUser wrapper-а по-горе (плановият тест очакваше "Питащ" — бъг, DAL-ът
  // JOIN-ва user таблицата, не chитa от заявката, което е правилното поведение).
  expect(row?.authorName).toBe("Тест Потребител");
  expect(row?.answerText).toBeNull();
  expect(row?.answeredAt).toBeNull();
});

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

test("answer: owner отговаря успешно; чужд потребител → NOT_FOUND", async () => {
  const { user, listingId } = await ownerWithListing();
  const asker = await createTestUser();
  cleanupIds.push(asker.id);
  const askerUser: SessionUser = { id: asker.id, email: asker.email, name: "Питащ", isAdmin: false };
  const q = await QaDAL.for(askerUser).ask({ listingId, body: "Има ли паркинг?" });

  const stranger = await createTestUser();
  cleanupIds.push(stranger.id);
  const strangerUser: SessionUser = { id: stranger.id, email: stranger.email, name: "Чужд", isAdmin: false };
  await expect(QaDAL.for(strangerUser).answer({ questionId: q.id, text: "Да" }))
    .rejects.toMatchObject({ code: "NOT_FOUND" });

  await QaDAL.for(user).answer({ questionId: q.id, text: "Да, има безплатен паркинг." });
  const listed = await QaDAL.public().listByListing(listingId);
  const row = listed.find((r) => r.id === q.id);
  expect(row?.answerText).toBe("Да, има безплатен паркинг.");
  expect(row?.answeredAt).not.toBeNull();
});

test("answer: admin (не owner) също може да отговори", async () => {
  const { listingId } = await ownerWithListing();
  const asker = await createTestUser();
  cleanupIds.push(asker.id);
  const askerUser: SessionUser = { id: asker.id, email: asker.email, name: "Питащ", isAdmin: false };
  const q = await QaDAL.for(askerUser).ask({ listingId, body: "Ползвате ли договор?" });

  const admin = await createTestUser({ isAdmin: true });
  cleanupIds.push(admin.id);
  const adminUser: SessionUser = { id: admin.id, email: admin.email, name: "Админ", isAdmin: true };
  await QaDAL.for(adminUser).answer({ questionId: q.id, text: "Да, стандартен договор." });

  const listed = await QaDAL.public().listByListing(listingId);
  expect(listed.find((r) => r.id === q.id)?.answerText).toBe("Да, стандартен договор.");
});

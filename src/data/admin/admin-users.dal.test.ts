import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestUser, cleanupTestUser, testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { AdminDAL } from "./admin.dal";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function newUser(): Promise<string> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  return u.id;
}

// вкарва жива сесия за user-а, за да проверим инвалидацията
async function insertSession(userId: string): Promise<string> {
  const id = randomUUID();
  await testDb.insert(schema.session).values({
    id,
    userId,
    token: `tok-${id}`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

test("blockUser(): сетва deletedAt + трие живите сесии", async () => {
  const adminId = await newUser();
  const targetId = await newUser();
  await insertSession(targetId);

  await AdminDAL.blockUser(adminId, targetId);

  const [row] = await testDb.select().from(schema.user).where(eq(schema.user.id, targetId));
  expect(row?.deletedAt).not.toBeNull(); // → getCurrentUser guard връща null (deletedAt != null)
  const sessions = await testDb.select().from(schema.session).where(eq(schema.session.userId, targetId));
  expect(sessions.length).toBe(0);
});

test("unblockUser(): нулира deletedAt", async () => {
  const adminId = await newUser();
  const targetId = await newUser();
  await AdminDAL.blockUser(adminId, targetId);
  await AdminDAL.unblockUser(targetId);
  const [row] = await testDb.select().from(schema.user).where(eq(schema.user.id, targetId));
  expect(row?.deletedAt).toBeNull();
});

test("отказва unblock на анонимизиран акаунт", async () => {
  const uid = await newUser();
  // Симулирай анонимизирана акаунт: сетни deletedAt и anonymizedAt
  await testDb.update(schema.user).set({ deletedAt: new Date(), anonymizedAt: new Date() }).where(eq(schema.user.id, uid));
  await expect(AdminDAL.unblockUser(uid)).rejects.toMatchObject({ code: "CONFLICT" });
});

test("blockUser()/setAdmin(): self-guard — админ не действа върху себе си", async () => {
  const adminId = await newUser();
  await expect(AdminDAL.blockUser(adminId, adminId)).rejects.toThrow("SELF_ACTION");
  await expect(AdminDAL.setAdmin(adminId, adminId, false)).rejects.toThrow("SELF_ACTION");
});

test("setAdmin(): вдига/сваля isAdmin на друг", async () => {
  const adminId = await newUser();
  const targetId = await newUser();
  await AdminDAL.setAdmin(adminId, targetId, true);
  const [row] = await testDb.select().from(schema.user).where(eq(schema.user.id, targetId));
  expect(row?.isAdmin).toBe(true);
});

test("listUsers(): връща deletedAt за soft-deleted, null за активен", async () => {
  const activeId = await newUser();
  const blockedId = await newUser();
  await AdminDAL.blockUser(activeId, blockedId);
  const { items } = await AdminDAL.listUsers();
  expect(items.find((u) => u.id === blockedId)?.deletedAt).not.toBeNull(); // id-scoped
  expect(items.find((u) => u.id === activeId)?.deletedAt).toBeNull();
});

test("listUsers({page,limit}): limit=1 връща 1 ред по created_at DESC + коректен total; page 2 пропуска реда от page 1", async () => {
  const newerId = await newUser();
  // far-future createdAt → гарантирано глобално най-нов ред (споделена таблица между тестове)
  await testDb.update(schema.user)
    .set({ createdAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) })
    .where(eq(schema.user.id, newerId));

  const p1 = await AdminDAL.listUsers({ page: 1, limit: 1 });
  expect(p1.items.length).toBe(1);
  expect(p1.items[0]?.id).toBe(newerId);
  expect(p1.total).toBeGreaterThanOrEqual(1);
  expect(p1.limit).toBe(1);

  const p2 = await AdminDAL.listUsers({ page: 2, limit: 1 });
  expect(p2.items.some((u) => u.id === newerId)).toBe(false); // offset прескочи page 1 реда
});

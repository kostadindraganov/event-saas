import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { listing } from "@/db/schema";
import { createTestUser, cleanupTestUser, createTestSubscription, getTestCategoryId, getTestCityId } from "@/test/db-helpers";
import { ListingDAL } from "@/data/catalog/listing.dal";
import type { SessionUser } from "@/data/users/require-user";
import { BillingDAL } from "@/data/billing/billing.dal";
import { POST } from "./route";

let userId: string;
let sessionUser: SessionUser;
let categoryId: string;
let cityId: string;

beforeAll(async () => {
  const u = await createTestUser();
  userId = u.id;
  sessionUser = { id: u.id, email: u.email, name: "Тест", isAdmin: false };
  categoryId = await getTestCategoryId();
  cityId = await getTestCityId();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanupTestUser(userId);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});

function req(auth?: string) {
  return new Request("http://localhost/api/cron/subscriptions", {
    method: "POST",
    headers: auth ? { Authorization: auth } : {},
  });
}

test("401 без валиден CRON_SECRET", async () => {
  const res = await POST(req());
  expect(res.status).toBe(401);
  const res2 = await POST(req("Bearer wrong"));
  expect(res2.status).toBe(401);
});

test("вътрешна грешка → 500 с generic body", async () => {
  const spy = vi.spyOn(BillingDAL, "expireGracePeriods").mockRejectedValueOnce(new Error("boom"));
  const res = await POST(req("Bearer test-cron-secret"));
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "INTERNAL" });
  spy.mockRestore();
});

test("изтекъл гратис → published обявите се скриват (hiddenBySystem) + {hidden: n}", async () => {
  // все още в гратис (бъдещ graceUntil), за да мине submit()-ът (assertCanPublish изисква активен/в-гратис статус)
  await createTestSubscription(userId, {
    plan: "standard",
    status: "past_due",
    graceUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const dal = ListingDAL.for(sessionUser);
  const l = await dal.createDraft({ title: "Изтекъл Гратис Тест", categoryId, cityId });
  await dal.submit(l.id);

  // сега гратисът изтича (симулира изминало време без потребителят да е направил нищо)
  await createTestSubscription(userId, {
    plan: "standard",
    status: "past_due",
    graceUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // вчера — изтекъл
  });

  const res = await POST(req("Bearer test-cron-secret"));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.hidden).toBeGreaterThanOrEqual(1);

  const [row] = await db.select().from(listing).where(eq(listing.id, l.id));
  expect(row?.status).toBe("hidden");
  expect(row?.hiddenBySystem).toBe(true);
});

test("неизтекъл гратис → no-op (обявата остава published)", async () => {
  const u2 = await createTestUser();
  const u2Session: SessionUser = { id: u2.id, email: u2.email, name: "Тест2", isAdmin: false };
  await createTestSubscription(u2.id, {
    plan: "standard",
    status: "past_due",
    graceUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // утре — неизтекъл
  });
  const dal = ListingDAL.for(u2Session);
  const l = await dal.createDraft({ title: "Неизтекъл Гратис Тест", categoryId, cityId });
  await dal.submit(l.id);

  await POST(req("Bearer test-cron-secret"));

  const [row] = await db.select().from(listing).where(eq(listing.id, l.id));
  expect(row?.status).toBe("published");

  await cleanupTestUser(u2.id);
});

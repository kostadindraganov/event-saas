import { afterAll, beforeAll, expect, test } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { testDb } from "@/test/db-helpers";
import * as schema from "@/db/schema";
import { getBillingSettings } from "@/data/billing/billing.dal";
import { AdminDAL } from "./admin.dal";

const KEYS = ["billing.limits", "billing.graceDays", "billing.promo"];
let snapshot: { key: string; value: unknown }[] = [];

beforeAll(async () => {
  snapshot = await testDb.select().from(schema.setting).where(inArray(schema.setting.key, KEYS));
});
afterAll(async () => {
  // възстанови точно каквото беше (или трий ако не е съществувал)
  for (const key of KEYS) {
    const orig = snapshot.find((r) => r.key === key);
    if (orig) {
      await testDb.insert(schema.setting).values({ key, value: orig.value })
        .onConflictDoUpdate({ target: schema.setting.key, set: { value: orig.value } });
    } else {
      await testDb.delete(schema.setting).where(eq(schema.setting.key, key));
    }
  }
});

test("updateSettings(): валиден вход round-trip-ва през getBillingSettings", async () => {
  // ВАЖНО: този тест commit-ва глобалния singleton `setting`, а billing.dal.test.ts чете
  // СЪЩИТЕ редове конкурентно (getBillingSettings). Билинг-чувствителните полета
  // (standard/premiumPerCategory/premiumSlots/durationDays) ТРЯБВА да останат на DEFAULT —
  // иначе конкурентен LIMIT_REACHED тест там чете завишен лимит и не хвърля (flake, ~1/3).
  // Варираме само graceDays + carouselSize (никой конкурентен тест не зависи от точните им
  // стойности; carouselSize е stored-but-unused), което пак доказва че updateSettings
  // персистира входа, а не го игнорира. НЕ връщай не-default сензитивни стойности тук.
  const input = {
    limits: { standard: 1, premiumPerCategory: 2 },
    graceDays: 10,
    promo: { durationDays: 30, premiumSlots: 2, carouselSize: 99 },
  };
  const returned = await AdminDAL.updateSettings(input);
  expect(returned).toEqual(input);
  const read = await getBillingSettings();
  expect(read).toEqual(input);
});

test("getBillingSettings(): невалиден jsonb ред → fallback DEFAULT за този ключ", async () => {
  // вкарай боклук в billing.limits директно
  await testDb.insert(schema.setting).values({ key: "billing.limits", value: { junk: "bad" } })
    .onConflictDoUpdate({ target: schema.setting.key, set: { value: { junk: "bad" } } });
  const read = await getBillingSettings();
  expect(read.limits).toEqual({ standard: 1, premiumPerCategory: 2 }); // DEFAULT_SETTINGS.limits
});

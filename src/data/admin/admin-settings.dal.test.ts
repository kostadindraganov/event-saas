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
  const input = {
    limits: { standard: 3, premiumPerCategory: 5 },
    graceDays: 10,
    promo: { durationDays: 45, premiumSlots: 4, carouselSize: 12 },
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

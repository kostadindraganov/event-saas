import { afterEach, beforeEach, expect, test, vi } from "vitest";

// ponytail: стъпваме върху реалната .env (DATABASE_URL и др.) — само Polar ключовете
// се stub-ват, за да изолираме двата клона (с/без Polar) от каквото реално стои в .env.
const POLAR_ENV_KEYS = [
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_ENV",
  "POLAR_PRODUCT_STANDARD_MONTHLY",
  "POLAR_PRODUCT_STANDARD_YEARLY",
  "POLAR_PRODUCT_PREMIUM_MONTHLY",
  "POLAR_PRODUCT_PREMIUM_YEARLY",
] as const;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("auth инициализира без грешка БЕЗ Polar env ключове", async () => {
  for (const k of POLAR_ENV_KEYS) vi.stubEnv(k, "");
  const { auth } = await import("./auth");
  expect(typeof auth.api.getSession).toBe("function");
});

test("auth инициализира без грешка С Polar env ключове", async () => {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "polar_oat_test");
  vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("POLAR_ENV", "sandbox");
  vi.stubEnv("POLAR_PRODUCT_STANDARD_MONTHLY", "prod_standard_monthly");
  vi.stubEnv("POLAR_PRODUCT_STANDARD_YEARLY", "prod_standard_yearly");
  vi.stubEnv("POLAR_PRODUCT_PREMIUM_MONTHLY", "prod_premium_monthly");
  vi.stubEnv("POLAR_PRODUCT_PREMIUM_YEARLY", "prod_premium_yearly");
  const { auth } = await import("./auth");
  expect(typeof auth.api.getSession).toBe("function");
});

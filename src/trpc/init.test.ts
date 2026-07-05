import { expect, test } from "vitest";
import { appRouter } from "./routers/_app";
import { createCallerFactory } from "./init";

const createCaller = createCallerFactory(appRouter);

test("health.ping е публичен", async () => {
  const caller = createCaller({ user: null });
  const res = await caller.health.ping();
  expect(res.ok).toBe(true);
});

test("health.whoami изисква сесия", async () => {
  const caller = createCaller({ user: null });
  await expect(caller.health.whoami()).rejects.toThrow();
  const authed = createCaller({
    user: { id: "u1", email: "a@b.bg", name: "Тест", isAdmin: false },
  });
  await expect(authed.health.whoami()).resolves.toEqual({ id: "u1" });
});

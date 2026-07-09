import { expect, test } from "vitest";
import { checkRateLimit } from "./rate-limit";

test("пуска до лимита, после хвърля, изолирано per-user", () => {
  for (let i = 0; i < 3; i++) checkRateLimit("test", "userA", 3, 1000);
  expect(() => checkRateLimit("test", "userA", 3, 1000)).toThrow(/TOO_MANY_REQUESTS|429/);
  expect(() => checkRateLimit("test", "userB", 3, 1000)).not.toThrow(); // друг user — чист
});

test("прозорецът се плъзга — след изтичане на windowMs заявките пак минават", async () => {
  const key = "slide-" + Math.random();
  for (let i = 0; i < 2; i++) checkRateLimit(key, "userC", 2, 50);
  expect(() => checkRateLimit(key, "userC", 2, 50)).toThrow();
  await new Promise((r) => setTimeout(r, 60));
  expect(() => checkRateLimit(key, "userC", 2, 50)).not.toThrow();
});

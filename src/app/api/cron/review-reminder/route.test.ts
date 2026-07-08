import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { ReviewDAL } from "@/data/reviews/review.dal";
import { POST } from "./route";

beforeAll(() => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});

function req(auth?: string) {
  return new Request("http://localhost/api/cron/review-reminder", {
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
  vi.spyOn(ReviewDAL, "findReminderTargets").mockRejectedValueOnce(new Error("boom"));
  const res = await POST(req("Bearer test-cron-secret"));
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "INTERNAL" });
});

test("праща напомняне на всяка цел и връща {reminded}", async () => {
  vi.spyOn(ReviewDAL, "findReminderTargets").mockResolvedValueOnce([
    { bookingId: "b1", email: "a@x.bg", listingTitle: "Фото Студио" },
    { bookingId: "b2", email: "b@x.bg", listingTitle: "Диджей Иван" },
  ]);
  const res = await POST(req("Bearer test-cron-secret"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ reminded: 2 });
});

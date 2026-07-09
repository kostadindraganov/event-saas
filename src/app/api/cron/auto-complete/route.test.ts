import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { booking } from "@/db/schema";
import {
  testDb,
  createTestUser,
  cleanupTestUser,
  createTestListing,
  createTestServiceType,
  createTestBooking,
  getTestCategoryId,
  getTestCityId,
} from "@/test/db-helpers";
import { BookingDAL } from "@/data/booking/booking.dal";
import { POST } from "./route";

let ownerId: string, customerId: string, listingId: string, serviceTypeId: string;
let confirmedPastId: string, pendingPastId: string;

beforeAll(async () => {
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  const owner = await createTestUser();
  const customer = await createTestUser();
  ownerId = owner.id;
  customerId = customer.id;
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const listing = await createTestListing(ownerId, { status: "published", categoryId, cityId });
  listingId = listing.id;
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Целодневно" });
  serviceTypeId = st.id;

  const past = "2020-01-01"; // сигурно в миналото спрямо всяко "днес"
  const confirmedPast = await createTestBooking(listingId, serviceTypeId, customerId, {
    status: "confirmed",
    isFullDay: true,
    eventDate: past,
    phone: "0888000001",
  });
  confirmedPastId = confirmedPast.id;
  const pendingPast = await createTestBooking(listingId, serviceTypeId, customerId, {
    status: "pending",
    isFullDay: true,
    eventDate: past,
    phone: "0888000002",
  });
  pendingPastId = pendingPast.id;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await cleanupTestUser(ownerId);
  await cleanupTestUser(customerId);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
});

function req(auth?: string) {
  return new Request("http://localhost/api/cron/auto-complete", {
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
  const spy = vi.spyOn(BookingDAL, "autoComplete").mockRejectedValueOnce(new Error("boom"));
  const res = await POST(req("Bearer test-cron-secret"));
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: "INTERNAL" });
  spy.mockRestore();
});

test("минали confirmed→completed, минали pending→auto_declined + {completed,autoDeclined}", async () => {
  const res = await POST(req("Bearer test-cron-secret"));
  expect(res.status).toBe(200);
  // ponytail: cron route-ът вика глобален autoComplete() — другите test файлове го викат
  // конкурентно, затова НЕ асертираме върху върнатата глобална тала (race), а директно по id.
  await res.json();

  const [confirmedRow] = await testDb.select().from(booking).where(eq(booking.id, confirmedPastId));
  expect(confirmedRow?.status).toBe("completed");
  const [pendingRow] = await testDb.select().from(booking).where(eq(booking.id, pendingPastId));
  expect(pendingRow?.status).toBe("auto_declined");
});

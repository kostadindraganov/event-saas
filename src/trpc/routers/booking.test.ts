import { afterAll, expect, test } from "vitest";
import { appRouter } from "./_app";
import { createCallerFactory } from "../init";
import { createTestUser, cleanupTestUser, createTestListing, createTestServiceType, getTestCategoryId, getTestCityId } from "@/test/db-helpers";

// bookingRouter не извиква revalidateTag никъде (виж бележката в Step 2) → без vi.mock("next/cache") тук.
const createCaller = createCallerFactory(appRouter);
const anon = createCaller({ user: null });

let ownerId: string, customerId: string;
let listingId: string, serviceTypeId: string;

async function setup() {
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
}

afterAll(async () => {
  await cleanupTestUser(ownerId);
  await cleanupTestUser(customerId);
});

test("публични процедури са достъпни неаутентикирано", async () => {
  await setup();
  const list = await anon.booking.serviceType.listActive({ listingId });
  expect(Array.isArray(list)).toBe(true);
  const month = await anon.booking.availability.month({ listingId, year: 2026, month: 8 });
  expect(Array.isArray(month)).toBe(true);
});

test("защитени процедури отхвърлят неаутентикирано → UNAUTHORIZED", async () => {
  await expect(anon.booking.listMine()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(anon.booking.vendorCalendar.incoming()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    anon.booking.request({ listingId, serviceTypeId, eventDate: "2026-09-01", phone: "0888123456" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("request → confirm делегират към BookingDAL", async () => {
  const customerCaller = createCaller({ user: { id: customerId, email: "c@ev.test", name: "Клиент", isAdmin: false } });
  const ownerCaller = createCaller({ user: { id: ownerId, email: "o@ev.test", name: "Собственик", isAdmin: false } });

  const booking = await customerCaller.booking.request({
    listingId,
    serviceTypeId,
    eventDate: "2026-09-01",
    phone: "0888123456",
  });
  expect(booking.status).toBe("pending");

  const confirmed = await ownerCaller.booking.confirm({ id: booking.id });
  expect(confirmed.slug).toBeTruthy();
});

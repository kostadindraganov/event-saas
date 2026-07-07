import { afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { CalendarDAL } from "./calendar.dal";
import {
  testDb, createTestUser, cleanupTestUser, createTestListing, getTestCategoryId, getTestCityId,
  createTestBooking,
} from "@/test/db-helpers";
import * as schema from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function ownerWithListing(): Promise<{ user: SessionUser; listingId: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(u.id, { status: "published", categoryId, cityId });
  return { user: { id: u.id, email: u.email, name: "Доставчик", isAdmin: false }, listingId: l.id };
}

test("createServiceType/listServiceTypes/updateServiceType: owner CRUD, чужд потребител → FORBIDDEN", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);

  const st = await dal.createServiceType({
    listingId, kind: "full_day", name: "Цял ден", durationMinutes: null, priceFromCents: 50000, isActive: true,
  });
  expect(st.kind).toBe("full_day");

  const listed = await dal.listServiceTypes(listingId);
  expect(listed.map((s) => s.id)).toContain(st.id);

  const updated = await dal.updateServiceType({
    id: st.id, listingId, kind: "full_day", name: "Цял ден 2", durationMinutes: null, priceFromCents: 60000, isActive: true,
  });
  expect(updated.name).toBe("Цял ден 2");

  const stranger = await createTestUser();
  cleanupIds.push(stranger.id);
  const strangerUser: SessionUser = { id: stranger.id, email: stranger.email, name: "Чужд", isAdmin: false };
  await expect(CalendarDAL.for(strangerUser).listServiceTypes(listingId)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("deleteServiceType: in-use → CONFLICT SERVICE_TYPE_IN_USE; неизползвана се трие свободно", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);
  const st = await dal.createServiceType({
    listingId, kind: "hourly", name: "Час", durationMinutes: 60, priceFromCents: 10000, isActive: true,
  });

  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  await createTestBooking(listingId, st.id, customer.id, {
    isFullDay: false, eventDate: "2099-01-05", startTime: "10:00:00", endTime: "11:00:00", phone: "0888123123",
  });

  await expect(dal.deleteServiceType(st.id)).rejects.toMatchObject({ code: "CONFLICT", message: "SERVICE_TYPE_IN_USE" });

  const st2 = await dal.createServiceType({
    listingId, kind: "hourly", name: "Час 2", durationMinutes: 30, priceFromCents: 5000, isActive: true,
  });
  await dal.deleteServiceType(st2.id);
  const listed = await dal.listServiceTypes(listingId);
  expect(listed.some((s) => s.id === st2.id)).toBe(false);
});

test("setAvailability: replace-all — вторият извикване напълно заменя правилата от първия", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);

  const first = await dal.setAvailability({ listingId, rules: [{ weekday: 1, startTime: "09:00", endTime: "12:00" }] });
  expect(first).toHaveLength(1);

  const second = await dal.setAvailability({
    listingId,
    rules: [{ weekday: 2, startTime: "10:00", endTime: "14:00" }, { weekday: 3, startTime: "10:00", endTime: "14:00" }],
  });
  expect(second).toHaveLength(2);

  const stored = await dal.getAvailability(listingId);
  expect(stored).toHaveLength(2);
  expect(stored.some((r) => r.weekday === 1)).toBe(false); // старото правило (weekday=1) е заменено
});

test("blockedDate: create/list/delete, дубликат (listingId,date) → CONFLICT DATE_ALREADY_BLOCKED", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);

  const bd = await dal.createBlockedDate({ listingId, date: "2099-02-01", note: "Почивка" });
  const listed = await dal.listBlockedDates(listingId);
  expect(listed.map((b) => b.id)).toContain(bd.id);

  await expect(dal.createBlockedDate({ listingId, date: "2099-02-01" }))
    .rejects.toMatchObject({ code: "CONFLICT", message: "DATE_ALREADY_BLOCKED" });

  await dal.deleteBlockedDate(bd.id);
  const afterDelete = await dal.listBlockedDates(listingId);
  expect(afterDelete.some((b) => b.id === bd.id)).toBe(false);
});

test("listIncoming: скоупнато само до обявите на owner-а, не вижда чужди", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);
  const st = await dal.createServiceType({
    listingId, kind: "full_day", name: "Цял ден", durationMinutes: null, priceFromCents: 50000, isActive: true,
  });

  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  await createTestBooking(listingId, st.id, customer.id, { isFullDay: true, eventDate: "2099-03-01", phone: "0888123123" });

  const { user: otherOwner } = await ownerWithListing();

  const mine = await dal.listIncoming();
  expect(mine.some((b) => b.listingId === listingId)).toBe(true);

  const others = await CalendarDAL.for(otherOwner).listIncoming();
  expect(others.some((b) => b.listingId === listingId)).toBe(false);
});

test("availabilityMonth: confirmed full_day → busy; blockedDate → busy; свободен ден → free", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);
  const st = await dal.createServiceType({
    listingId, kind: "full_day", name: "Цял ден", durationMinutes: null, priceFromCents: 50000, isActive: true,
  });
  await dal.createBlockedDate({ listingId, date: "2099-04-10" });

  const customer = await createTestUser();
  cleanupIds.push(customer.id);
  await createTestBooking(listingId, st.id, customer.id, {
    status: "confirmed", isFullDay: true, eventDate: "2099-04-15", phone: "0888123123",
  });

  const days = await CalendarDAL.public().availabilityMonth(listingId, 2099, 4);
  expect(days.find((d) => d.date === "2099-04-10")?.state).toBe("busy"); // blockedDate
  expect(days.find((d) => d.date === "2099-04-15")?.state).toBe("busy"); // confirmed full_day
  expect(days.find((d) => d.date === "2099-04-01")?.state).toBe("free");
});

test("slotsDay: делегира на slots.generateDaySlots — свободен ден дава слотовете от правилото, блокиран ден → []", async () => {
  const { user, listingId } = await ownerWithListing();
  const dal = CalendarDAL.for(user);
  const st = await dal.createServiceType({
    listingId, kind: "hourly", name: "Час", durationMinutes: 60, priceFromCents: 10000, isActive: true,
  });
  // правило за всеки weekday — тестът не зависи от това кой ден от седмицата е конкретната дата
  await dal.setAvailability({
    listingId, rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: "09:00", endTime: "11:00" })),
  });
  await dal.createBlockedDate({ listingId, date: "2099-05-14" });

  const freeSlots = await CalendarDAL.public().slotsDay(listingId, st.id, "2099-05-07");
  expect(freeSlots).toEqual([{ startTime: "09:00", endTime: "10:00" }, { startTime: "10:00", endTime: "11:00" }]);

  const blockedSlots = await CalendarDAL.public().slotsDay(listingId, st.id, "2099-05-14");
  expect(blockedSlots).toEqual([]);
});

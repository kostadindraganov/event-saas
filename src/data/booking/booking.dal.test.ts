import { afterEach, expect, test } from "vitest";
import { BookingDAL } from "./booking.dal";
import {
  testDb, createTestUser, cleanupTestUser, createTestListing, getTestCategoryId, getTestCityId,
  createTestServiceType, createTestAvailability, createTestBooking, createTestReview,
} from "@/test/db-helpers";
import { weekdayOf } from "./slots";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SessionUser } from "@/data/users/require-user";

let cleanupIds: string[] = [];
afterEach(async () => {
  for (const id of cleanupIds) await cleanupTestUser(id);
  cleanupIds = [];
});

async function vendorWithListing(status: "published" | "draft" = "published"): Promise<{ vendor: SessionUser; listingId: string }> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  const categoryId = await getTestCategoryId();
  const cityId = await getTestCityId();
  const l = await createTestListing(u.id, { status, categoryId, cityId });
  return { vendor: { id: u.id, email: u.email, name: "Доставчик", isAdmin: false }, listingId: l.id };
}

async function newCustomer(): Promise<SessionUser> {
  const u = await createTestUser();
  cleanupIds.push(u.id);
  return { id: u.id, email: u.email, name: "Клиент", isAdmin: false };
}

test("request(): непубликувана обява → NOT_FOUND NOT_PUBLISHED", async () => {
  const { listingId } = await vendorWithListing("draft");
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "NOT_FOUND", message: "NOT_PUBLISHED" });
});

test("request(): собственик резервира собствената обява → FORBIDDEN SELF_BOOKING", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  await expect(BookingDAL.for(vendor).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "FORBIDDEN", message: "SELF_BOOKING" });
});

test("request(): минала дата → BAD_REQUEST PAST_DATE", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2020-01-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "PAST_DATE" });
});

test("request(): часова услуга без startTime → BAD_REQUEST INVALID_START_TIME", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  const customer = await newCustomer();
  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", phone: "0888123123",
  })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_START_TIME" });
});

test("request(): happy path — BookingDTO с изчислен endTime, вижда се в listMine()", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 90 });
  // rule стартира точно в 10:00, за да се подравни slot-стъпката (90мин) с искания старт
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-06-01"), startTime: "10:00", endTime: "12:00" });
  const customer = await newCustomer();

  const dto = await BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", startTime: "10:00", phone: "0888123123", message: "Здравейте",
  });

  expect(dto.status).toBe("pending");
  expect(dto.isFullDay).toBe(false);
  expect(dto.startTime).toBe("10:00");
  expect(dto.endTime).toBe("11:30"); // 10:00 + 90мин, изчислено през slots.addMinutes
  expect(dto.customerId).toBe(customer.id);

  const mine = await BookingDAL.for(customer).listMine();
  expect(mine.some((b) => b.id === dto.id)).toBe(true);
});

test("request(): часова услуга без configured availabilityRule → CONFLICT SLOT_UNAVAILABLE", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  const customer = await newCustomer();

  await expect(BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-01", startTime: "10:00", phone: "0888123123",
  })).rejects.toMatchObject({ code: "CONFLICT", message: "SLOT_UNAVAILABLE" });
});

test("request(): валиден слот в рамките на availabilityRule → успех", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-06-02"), startTime: "09:00", endTime: "11:00" });
  const customer = await newCustomer();

  const dto = await BookingDAL.for(customer).request({
    listingId, serviceTypeId: st.id, eventDate: "2099-06-02", startTime: "10:00", phone: "0888123123",
  });
  expect(dto.startTime).toBe("10:00");
  expect(dto.endTime).toBe("11:00");
});

test("confirm(): целодневно потвърждение заключва датата + auto_decline на ВСИЧКИ pending (цял ден и часови) за деня", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const fullDayType = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const hourlyType = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  // request() валидира часовия слот срещу offeredSlots → нужен е availabilityRule за 10:00-часа
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-07-10"), startTime: "10:00", endTime: "11:00" });
  const customerA = await newCustomer();
  const customerB = await newCustomer();
  const customerC = await newCustomer();

  const toConfirm = await BookingDAL.for(customerA).request({ listingId, serviceTypeId: fullDayType.id, eventDate: "2099-07-10", phone: "0888000001" });
  const otherFullDayPending = await BookingDAL.for(customerB).request({ listingId, serviceTypeId: fullDayType.id, eventDate: "2099-07-10", phone: "0888000002" });
  const hourlyPending = await BookingDAL.for(customerC).request({ listingId, serviceTypeId: hourlyType.id, eventDate: "2099-07-10", startTime: "10:00", phone: "0888000003" });

  const { slug } = await BookingDAL.for(vendor).confirm(toConfirm.id);
  expect(slug).toBeTruthy();

  const [confirmedRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, toConfirm.id));
  expect(confirmedRow?.status).toBe("confirmed");
  const [otherFullDayRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, otherFullDayPending.id));
  expect(otherFullDayRow?.status).toBe("auto_declined");
  const [hourlyRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, hourlyPending.id));
  expect(hourlyRow?.status).toBe("auto_declined");
});

test("confirm(): часово потвърждение auto-decline-ва overlapping часови pending + ВСИЧКИ pending целодневни за деня; неприпокриващ часови остава pending", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const fullDayType = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const hourlyType = await createTestServiceType(listingId, { kind: "hourly", name: "Час", durationMinutes: 60 });
  // отделни rule-и, за да са валидни точно исканите старт-часове (slot-стъпката е 60мин от rule.start)
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-07-11"), startTime: "10:00", endTime: "11:00" });
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-07-11"), startTime: "10:30", endTime: "11:30" });
  await createTestAvailability(listingId, { weekday: weekdayOf("2099-07-11"), startTime: "14:00", endTime: "15:00" });
  const customerA = await newCustomer();
  const customerB = await newCustomer();
  const customerC = await newCustomer();

  const toConfirm = await BookingDAL.for(customerA).request({ listingId, serviceTypeId: hourlyType.id, eventDate: "2099-07-11", startTime: "10:00", phone: "0888000001" });
  const overlappingPending = await BookingDAL.for(customerB).request({ listingId, serviceTypeId: hourlyType.id, eventDate: "2099-07-11", startTime: "10:30", phone: "0888000002" });
  const nonOverlappingPending = await BookingDAL.for(customerC).request({ listingId, serviceTypeId: hourlyType.id, eventDate: "2099-07-11", startTime: "14:00", phone: "0888000003" });
  const fullDayPending = await BookingDAL.for(customerA).request({ listingId, serviceTypeId: fullDayType.id, eventDate: "2099-07-11", phone: "0888000004" });

  await BookingDAL.for(vendor).confirm(toConfirm.id);

  const [overlapRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, overlappingPending.id));
  expect(overlapRow?.status).toBe("auto_declined");
  const [fullDayRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, fullDayPending.id));
  expect(fullDayRow?.status).toBe("auto_declined"); // денят вече не може да е цял
  const [nonOverlapRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, nonOverlappingPending.id));
  expect(nonOverlapRow?.status).toBe("pending"); // неприпокриващ часови остава свободен
});

test("confirm(): нова pending заявка за вече потвърдена (заета) дата → CONFLICT DATE_TAKEN", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const fullDayType = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customerA = await newCustomer();
  const customerB = await newCustomer();

  const first = await BookingDAL.for(customerA).request({ listingId, serviceTypeId: fullDayType.id, eventDate: "2099-07-12", phone: "0888000001" });
  await BookingDAL.for(vendor).confirm(first.id);

  // request() позволява нова заявка дори за вече заета дата (D7: pending не блокира) — confirm() я хваща
  const second = await BookingDAL.for(customerB).request({ listingId, serviceTypeId: fullDayType.id, eventDate: "2099-07-12", phone: "0888000002" });
  await expect(BookingDAL.for(vendor).confirm(second.id)).rejects.toMatchObject({ code: "CONFLICT", message: "DATE_TAKEN" });
});

test("decline(): pending → declined + declineReason", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  const req = await BookingDAL.for(customer).request({ listingId, serviceTypeId: st.id, eventDate: "2099-07-20", phone: "0888000001" });

  const { slug } = await BookingDAL.for(vendor).decline(req.id, "Зает съм тази дата");
  expect(slug).toBeTruthy();

  const [row] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, req.id));
  expect(row?.status).toBe("declined");
  expect(row?.declineReason).toBe("Зает съм тази дата");
});

test("cancel(): клиент отменя pending резервация → cancelled_by_customer", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  const req = await BookingDAL.for(customer).request({ listingId, serviceTypeId: st.id, eventDate: "2099-07-21", phone: "0888000001" });

  await BookingDAL.for(customer).cancel(req.id, "Промяна на плановете");

  const [row] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, req.id));
  expect(row?.status).toBe("cancelled_by_customer");
  expect(row?.cancelReason).toBe("Промяна на плановете");
});

test("cancel(): вендор отменя confirmed резервация → cancelled_by_vendor, освобождава датата за нов confirm", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  const req = await BookingDAL.for(customer).request({ listingId, serviceTypeId: st.id, eventDate: "2099-07-22", phone: "0888000001" });
  await BookingDAL.for(vendor).confirm(req.id);

  await BookingDAL.for(vendor).cancel(req.id, "Форсмажор");

  const [row] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, req.id));
  expect(row?.status).toBe("cancelled_by_vendor");

  const customer2 = await newCustomer();
  const req2 = await BookingDAL.for(customer2).request({ listingId, serviceTypeId: st.id, eventDate: "2099-07-22", phone: "0888000002" });
  await expect(BookingDAL.for(vendor).confirm(req2.id)).resolves.toMatchObject({ slug: expect.any(String) });
});

test("cancel(): дата в миналото → CONFLICT TOO_LATE", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  // request() блокира минали дати → вкарай директно през test helper-а, заобикаляйки guard-а
  const past = await createTestBooking(listingId, st.id, customer.id, { status: "confirmed", isFullDay: true, eventDate: "2020-01-01", phone: "0888000001" });

  await expect(BookingDAL.for(customer).cancel(past.id, "Твърде късно")).rejects.toMatchObject({ code: "CONFLICT", message: "TOO_LATE" });
});

test("autoComplete(): confirmed с минала дата → completed; pending с минала дата → auto_declined; бъдещи остават непипнати", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();

  const pastConfirmed = await createTestBooking(listingId, st.id, customer.id, { status: "confirmed", isFullDay: true, eventDate: "2020-01-01", phone: "0888000001" });
  const pastPending = await createTestBooking(listingId, st.id, customer.id, { status: "pending", isFullDay: true, eventDate: "2020-01-02", phone: "0888000002" });
  const futurePending = await createTestBooking(listingId, st.id, customer.id, { status: "pending", isFullDay: true, eventDate: "2099-08-01", phone: "0888000003" });

  // ponytail: autoComplete() е глобален cron scan (D4) — не е owner-scoped по дизайн, затова тук асертираме
  // делта (≥1) вместо точен owner-scoped select, а индивидуалните редове проверяваме директно по id.
  const result = await BookingDAL.autoComplete();
  expect(result.completed).toBeGreaterThanOrEqual(1);
  expect(result.autoDeclined).toBeGreaterThanOrEqual(1);

  const [c1] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, pastConfirmed.id));
  expect(c1?.status).toBe("completed");
  const [c2] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, pastPending.id));
  expect(c2?.status).toBe("auto_declined");
  const [c3] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, futurePending.id));
  expect(c3?.status).toBe("pending");
});

test("confirm(): auto_decline не пипа вече терминална заявка на същата дата (CAS status='pending')", async () => {
  // Регресия за CRITICAL: auto_decline UPDATE носи `AND status='pending'`, за да не презапише
  // терминален статус (declined/cancelled), който concurrent decline/cancel е commit-нал в прозореца
  // между SELECT и UPDATE. Истинският race не е in-process възпроизводим; тук асертираме наблюдаемия
  // инвариант — auto_decline засяга само pending редове.
  const { vendor, listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customerA = await newCustomer();
  const customerB = await newCustomer();

  const toConfirm = await BookingDAL.for(customerA).request({ listingId, serviceTypeId: st.id, eventDate: "2099-08-15", phone: "0888000001" });
  // B е вече терминална (declined) на същата дата — seed-ната директно
  const declinedB = await createTestBooking(listingId, st.id, customerB.id, { status: "declined", isFullDay: true, eventDate: "2099-08-15", phone: "0888000002" });

  await BookingDAL.for(vendor).confirm(toConfirm.id);

  const [bRow] = await testDb.select().from(schema.booking).where(eq(schema.booking.id, declinedB.id));
  expect(bRow?.status).toBe("declined"); // НЕ auto_declined — терминалната следа е запазена
});

test("confirm()/decline()/cancel(): чужд потребител (не собственик/клиент) → NOT_FOUND", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  const stranger = await newCustomer();

  const req1 = await BookingDAL.for(customer).request({ listingId, serviceTypeId: st.id, eventDate: "2099-09-01", phone: "0888000001" });
  await expect(BookingDAL.for(stranger).confirm(req1.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

  const req2 = await BookingDAL.for(customer).request({ listingId, serviceTypeId: st.id, eventDate: "2099-09-02", phone: "0888000002" });
  await expect(BookingDAL.for(stranger).decline(req2.id, "Причина")).rejects.toMatchObject({ code: "NOT_FOUND" });

  const req3 = await BookingDAL.for(customer).request({ listingId, serviceTypeId: st.id, eventDate: "2099-09-03", phone: "0888000003" });
  await expect(BookingDAL.for(stranger).cancel(req3.id, "Причина")).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("confirm(): pending резервация за минала дата → CONFLICT TOO_LATE", async () => {
  const { vendor, listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day", name: "Цял ден" });
  const customer = await newCustomer();
  // request() блокира минали дати → вкарай директно през test helper-а, заобикаляйки guard-а
  const past = await createTestBooking(listingId, st.id, customer.id, { status: "pending", isFullDay: true, eventDate: "2020-01-01", phone: "0888000001" });

  await expect(BookingDAL.for(vendor).confirm(past.id)).rejects.toMatchObject({ code: "CONFLICT", message: "TOO_LATE" });
});

test("listMine(): hasReview е true само за резервации с вече оставено ревю", async () => {
  const { listingId } = await vendorWithListing();
  const st = await createTestServiceType(listingId, { kind: "full_day" });
  const customer = await newCustomer();

  const reviewed = await createTestBooking(listingId, st.id, customer.id, {
    status: "completed", isFullDay: true, eventDate: "2020-01-01", phone: "0888000001",
  });
  const notReviewed = await createTestBooking(listingId, st.id, customer.id, {
    status: "completed", isFullDay: true, eventDate: "2020-01-02", phone: "0888000002",
  });
  await createTestReview(reviewed.id, listingId, customer.id);

  const mine = await BookingDAL.for(customer).listMine();
  expect(mine.find((b) => b.id === reviewed.id)?.hasReview).toBe(true);
  expect(mine.find((b) => b.id === notReviewed.id)?.hasReview).toBe(false);
});

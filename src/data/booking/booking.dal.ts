import "server-only";
import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { availabilityRule, blockedDate, booking, bookingServiceType, listing, review, user } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { addMinutes, generateDaySlots, isPastDate, overlaps, todaySofia, weekdayOf } from "./slots";
import { canCancelBooking, canModerateBooking } from "./booking.policy";
import {
  bookingCancelledEmail, bookingConfirmedEmail, bookingDeclinedEmail, bookingRequestedEmail, sendEmail,
} from "@/lib/email";
import { getBaseUrl } from "@/lib/seo";
import type { BookingDTO, BookingRequestInput, MyBookingDTO } from "./booking.dto";
import { pgCode } from "@/data/pg";

// ponytail: локален mapper, умишлено дублиран и в calendar.dal.ts (T7, listIncoming) — виж флага в
// началото на секцията (избягва cross-file forward-dependency между T7→T8).
function toBookingDTO(r: {
  id: string; listingId: string; listingSlug: string; listingTitle: string;
  serviceTypeId: string; serviceKind: "full_day" | "hourly"; serviceName: string;
  customerId: string; customerName: string; status: BookingDTO["status"]; isFullDay: boolean;
  eventDate: string; startTime: string | null; endTime: string | null; phone: string;
  message: string | null; declineReason: string | null; cancelReason: string | null;
  confirmedAt: Date | null; createdAt: Date;
}): BookingDTO {
  // ponytail: pg "time" колоните се четат обратно като "HH:MM:SS" — DTO-то (и останалата
  // booking логика, вкл. slots.ts) очаква "HH:MM", затова режем секундите тук, на едно място.
  return { ...r, startTime: r.startTime?.slice(0, 5) ?? null, endTime: r.endTime?.slice(0, 5) ?? null };
}

// bookings + listing/serviceType/customer join колони — споделени между request()/listMine() (T8)
// и confirm()/decline()/cancel() (T9, чете отделно inline в самата tx/CAS логика).
const bookingJoinColumns = {
  id: booking.id, listingId: booking.listingId, listingSlug: listing.slug, listingTitle: listing.title,
  serviceTypeId: booking.serviceTypeId, serviceKind: bookingServiceType.kind, serviceName: bookingServiceType.name,
  customerId: booking.customerId, customerName: user.name, status: booking.status, isFullDay: booking.isFullDay,
  eventDate: booking.eventDate, startTime: booking.startTime, endTime: booking.endTime, phone: booking.phone,
  message: booking.message, declineReason: booking.declineReason, cancelReason: booking.cancelReason,
  confirmedAt: booking.confirmedAt, createdAt: booking.createdAt,
};

// fire-and-forget: чете email от user; огледално на admin.dal.ts:34-49 (never-throw в caller-а)
// Сигнатурата на bookingRequestedEmail (Задача 5) няма customerName поле — не се подава.
async function notifyBookingRequested(vendorId: string, listingTitle: string, eventDate: string): Promise<void> {
  const [r] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, vendorId));
  if (!r?.email) return;
  const { subject, html } = bookingRequestedEmail({
    vendorName: r.name, listingTitle, eventDate,
    calendarUrl: `${getBaseUrl()}/profil/dostavchik/kalendar`,
  });
  await sendEmail({ to: r.email, subject, html });
}

// Задача 9 ги извиква (confirm/decline/cancel) — дефинирани тук, защото живеят в същия файл.
// bookingUrl сочи клиентската "Моите резервации" страница (Задача 15) — няма per-booking детайл страница в плана.
async function notifyBookingConfirmed(customerId: string, listingTitle: string, eventDate: string): Promise<void> {
  const [r] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, customerId));
  if (!r?.email) return;
  const { subject, html } = bookingConfirmedEmail({
    customerName: r.name, listingTitle, eventDate, bookingUrl: `${getBaseUrl()}/profil/rezervacii`,
  });
  await sendEmail({ to: r.email, subject, html });
}

async function notifyBookingDeclined(customerId: string, listingTitle: string, eventDate: string, reason: string, listingSlug: string): Promise<void> {
  const [r] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, customerId));
  if (!r?.email) return;
  const { subject, html } = bookingDeclinedEmail({
    customerName: r.name, listingTitle, eventDate, reason, listingUrl: `${getBaseUrl()}/obiava/${listingSlug}`,
  });
  await sendEmail({ to: r.email, subject, html });
}

// bookingUrl зависи от получателя: вендорът получава линк към календара, клиентът — към своите резервации.
async function notifyBookingCancelled(
  row: { customerId: string; listingOwnerId: string; listingTitle: string; eventDate: string; listingSlug: string },
  cancelledBy: "customer" | "vendor",
  reason: string,
): Promise<void> {
  const recipientId = cancelledBy === "customer" ? row.listingOwnerId : row.customerId;
  const bookingUrl = cancelledBy === "customer" ? `${getBaseUrl()}/profil/dostavchik/kalendar` : `${getBaseUrl()}/profil/rezervacii`;
  const [r] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, recipientId));
  if (!r?.email) return;
  const { subject, html } = bookingCancelledEmail({
    recipientName: r.name, listingTitle: row.listingTitle, eventDate: row.eventDate, reason, cancelledBy, bookingUrl,
  });
  await sendEmail({ to: r.email, subject, html });
}

export class BookingDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser): BookingDAL {
    return new BookingDAL(user);
  }

  async request(input: BookingRequestInput): Promise<BookingDTO> {
    const [l] = await db.select({ ownerId: listing.ownerId, status: listing.status, title: listing.title, slug: listing.slug })
      .from(listing).where(eq(listing.id, input.listingId));
    if (!l) throw new TRPCError({ code: "NOT_FOUND" });
    if (l.status !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "NOT_PUBLISHED" });
    if (l.ownerId === this.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "SELF_BOOKING" });

    const [st] = await db.select({
      listingId: bookingServiceType.listingId, kind: bookingServiceType.kind, name: bookingServiceType.name,
      durationMinutes: bookingServiceType.durationMinutes, isActive: bookingServiceType.isActive,
    }).from(bookingServiceType).where(eq(bookingServiceType.id, input.serviceTypeId));
    if (!st || st.listingId !== input.listingId || !st.isActive) {
      throw new TRPCError({ code: "NOT_FOUND", message: "SERVICE_TYPE_NOT_FOUND" });
    }

    if (isPastDate(input.eventDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "PAST_DATE" });

    const isFullDay = st.kind === "full_day";
    let startTime: string | null = null;
    let endTime: string | null = null;
    if (!isFullDay) {
      if (!input.startTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(input.startTime)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_START_TIME" });
      }
      startTime = input.startTime.slice(0, 5);
      endTime = addMinutes(startTime, st.durationMinutes!);

      // choke-point: заявеният слот трябва да е сред реално предлаганите — същата slot математика
      // като PublicCalendarDAL.slotsDay (calendar.dal.ts), инлайнато тук (T7 mapper прецедент за
      // умишлено малко дублиране между DAL-и вместо cross-file зависимост).
      const weekday = weekdayOf(input.eventDate);
      const [rules, blockedRows, confirmed] = await Promise.all([
        db.select({ startTime: availabilityRule.startTime, endTime: availabilityRule.endTime })
          .from(availabilityRule)
          .where(and(eq(availabilityRule.listingId, input.listingId), eq(availabilityRule.weekday, weekday))),
        db.select({ id: blockedDate.id }).from(blockedDate)
          .where(and(eq(blockedDate.listingId, input.listingId), eq(blockedDate.date, input.eventDate))),
        db.select({ isFullDay: booking.isFullDay, startTime: booking.startTime, endTime: booking.endTime })
          .from(booking)
          .where(and(eq(booking.listingId, input.listingId), eq(booking.status, "confirmed"), eq(booking.eventDate, input.eventDate))),
      ]);
      const confirmedFullDay = confirmed.some((c) => c.isFullDay);
      const confirmedHourly = confirmed
        .filter((c) => !c.isFullDay && c.startTime && c.endTime)
        .map((c) => ({ startTime: c.startTime!, endTime: c.endTime! }));
      const offeredSlots = generateDaySlots({
        rules, durationMinutes: st.durationMinutes!, blocked: blockedRows.length > 0, confirmedFullDay, confirmedHourly,
      });
      const slotAvailable = offeredSlots.some((s) => s.startTime === startTime && s.endTime === endTime);
      if (!slotAvailable) throw new TRPCError({ code: "CONFLICT", message: "SLOT_UNAVAILABLE" });
    }

    const [row] = await db.insert(booking).values({
      listingId: input.listingId, serviceTypeId: input.serviceTypeId, customerId: this.user.id,
      isFullDay, eventDate: input.eventDate, startTime, endTime, phone: input.phone, message: input.message ?? null,
    }).returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    void notifyBookingRequested(l.ownerId, l.title, input.eventDate).catch((e) => console.error("email failed", e));

    return toBookingDTO({
      id: row.id, listingId: row.listingId, listingSlug: l.slug, listingTitle: l.title,
      serviceTypeId: row.serviceTypeId, serviceKind: st.kind, serviceName: st.name,
      customerId: row.customerId, customerName: this.user.name, status: row.status, isFullDay: row.isFullDay,
      eventDate: row.eventDate, startTime: row.startTime, endTime: row.endTime, phone: row.phone, message: row.message,
      declineReason: row.declineReason, cancelReason: row.cancelReason, confirmedAt: row.confirmedAt, createdAt: row.createdAt,
    });
  }

  async listMine(): Promise<MyBookingDTO[]> {
    const rows = await db.select({ ...bookingJoinColumns, reviewId: review.id })
      .from(booking)
      .innerJoin(listing, eq(booking.listingId, listing.id))
      .innerJoin(bookingServiceType, eq(booking.serviceTypeId, bookingServiceType.id))
      .innerJoin(user, eq(booking.customerId, user.id))
      .leftJoin(review, eq(review.bookingId, booking.id))
      .where(eq(booking.customerId, this.user.id))
      .orderBy(desc(booking.createdAt));
    return rows.map((r) => ({ ...toBookingDTO(r), hasReview: r.reviewId !== null }));
  }

  // D3: ЕДНА транзакция — advisory lock → re-select(guard) → freeness guard(D2) → CAS → auto_decline(D2).
  async confirm(id: string): Promise<{ slug: string }> {
    const result = await db.transaction(async (tx) => {
      // фаза 1 (без lock): само за да знаем КАКВО да заключим — listingId/eventDate са immutable след insert
      const [pre] = await tx.select({ listingId: booking.listingId, eventDate: booking.eventDate })
        .from(booking).where(eq(booking.id, id));
      if (!pre) throw new TRPCError({ code: "NOT_FOUND" });

      // advisory xact lock по (listingId,eventDate) — сериализира конкурентни confirm-и за същата обява+дата
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${pre.listingId + pre.eventDate}, 0))`);

      // фаза 2 (под lock-а): авторитетно re-select
      const [row] = await tx.select({
        id: booking.id, listingId: booking.listingId, status: booking.status, isFullDay: booking.isFullDay,
        eventDate: booking.eventDate, startTime: booking.startTime, endTime: booking.endTime,
        customerId: booking.customerId, listingOwnerId: listing.ownerId, listingSlug: listing.slug, listingTitle: listing.title,
      }).from(booking).innerJoin(listing, eq(booking.listingId, listing.id)).where(eq(booking.id, id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canModerateBooking(this.user, row.listingOwnerId)) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "NOT_PENDING" });
      if (isPastDate(row.eventDate)) throw new TRPCError({ code: "CONFLICT", message: "TOO_LATE" });

      // freeness guard (D2)
      const confirmedRows = await tx.select({ isFullDay: booking.isFullDay, startTime: booking.startTime, endTime: booking.endTime })
        .from(booking)
        .where(and(eq(booking.listingId, row.listingId), eq(booking.eventDate, row.eventDate), eq(booking.status, "confirmed")));
      if (row.isFullDay) {
        if (confirmedRows.length > 0) throw new TRPCError({ code: "CONFLICT", message: "DATE_TAKEN" });
      } else {
        if (confirmedRows.some((c) => c.isFullDay)) throw new TRPCError({ code: "CONFLICT", message: "DATE_TAKEN" });
        const overlap = confirmedRows.some((c) => !c.isFullDay && c.startTime && c.endTime && overlaps(row.startTime!, row.endTime!, c.startTime, c.endTime));
        if (overlap) throw new TRPCError({ code: "CONFLICT", message: "SLOT_TAKEN" });
      }

      // CAS → confirmed (partial unique index е DB backstop за race-а, catch 23505 defensively)
      let updated: { id: string } | undefined;
      try {
        [updated] = await tx.update(booking).set({ status: "confirmed", confirmedAt: new Date() })
          .where(and(eq(booking.id, id), eq(booking.status, "pending"))).returning({ id: booking.id });
      } catch (err) {
        if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "DATE_TAKEN" });
        throw err;
      }
      if (!updated) throw new TRPCError({ code: "CONFLICT", message: "NOT_PENDING" });

      // auto_decline на конкурентните pending по D2
      const pendingRows = await tx.select({ id: booking.id, isFullDay: booking.isFullDay, startTime: booking.startTime, endTime: booking.endTime })
        .from(booking)
        .where(and(eq(booking.listingId, row.listingId), eq(booking.eventDate, row.eventDate), eq(booking.status, "pending"), ne(booking.id, id)));
      const toDecline = row.isFullDay
        ? pendingRows.map((p) => p.id)
        : pendingRows
            .filter((p) => p.isFullDay || (!!p.startTime && !!p.endTime && overlaps(row.startTime!, row.endTime!, p.startTime, p.endTime)))
            .map((p) => p.id);
      if (toDecline.length > 0) {
        // CAS на status='pending': concurrent cancel/decline (без advisory lock) може да е commit-нал
        // терминален статус в прозореца след горния SELECT — не го презаписвай (D8 audit следа).
        await tx.update(booking).set({ status: "auto_declined" })
          .where(and(inArray(booking.id, toDecline), eq(booking.status, "pending")));
      }

      return { slug: row.listingSlug, customerId: row.customerId, listingTitle: row.listingTitle, eventDate: row.eventDate };
    });

    void notifyBookingConfirmed(result.customerId, result.listingTitle, result.eventDate).catch((e) => console.error("email failed", e));
    return { slug: result.slug };
  }

  // moderator guard; единичен CAS (WHERE status='pending') — без tx (аналог на admin.dal.ts reject()).
  async decline(id: string, reason: string): Promise<{ slug: string }> {
    const [row] = await db.select({
      customerId: booking.customerId, listingOwnerId: listing.ownerId, listingSlug: listing.slug,
      listingTitle: listing.title, eventDate: booking.eventDate,
    }).from(booking).innerJoin(listing, eq(booking.listingId, listing.id)).where(eq(booking.id, id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (!canModerateBooking(this.user, row.listingOwnerId)) throw new TRPCError({ code: "NOT_FOUND" });

    const [updated] = await db.update(booking).set({ status: "declined", declineReason: reason })
      .where(and(eq(booking.id, id), eq(booking.status, "pending"))).returning({ id: booking.id });
    if (!updated) throw new TRPCError({ code: "CONFLICT", message: "NOT_PENDING" });

    void notifyBookingDeclined(row.customerId, row.listingTitle, row.eventDate, reason, row.listingSlug).catch((e) => console.error("email failed", e));
    return { slug: row.listingSlug };
  }

  // canCancelBooking решава КОЙ може (customer/vendor/null); DAL пази датата (D8: eventDate>=today) и CAS-а.
  async cancel(id: string, reason: string): Promise<{ slug: string }> {
    const [row] = await db.select({
      status: booking.status, customerId: booking.customerId, eventDate: booking.eventDate,
      listingOwnerId: listing.ownerId, listingSlug: listing.slug, listingTitle: listing.title,
    }).from(booking).innerJoin(listing, eq(booking.listingId, listing.id)).where(eq(booking.id, id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });

    const side = canCancelBooking(this.user, { customerId: row.customerId, listingOwnerId: row.listingOwnerId, status: row.status });
    if (!side) throw new TRPCError({ code: "NOT_FOUND" });
    if (isPastDate(row.eventDate)) throw new TRPCError({ code: "CONFLICT", message: "TOO_LATE" });

    const newStatus = side === "customer" ? "cancelled_by_customer" : "cancelled_by_vendor";
    const [updated] = await db.update(booking).set({ status: newStatus, cancelReason: reason })
      .where(and(eq(booking.id, id), inArray(booking.status, ["pending", "confirmed"]))).returning({ id: booking.id });
    if (!updated) throw new TRPCError({ code: "CONFLICT", message: "NOT_CANCELLABLE" });

    void notifyBookingCancelled(row, side, reason).catch((e) => console.error("email failed", e));
    return { slug: row.listingSlug };
  }

  // D4 cron: confirmed+минала дата → completed; pending+минала дата → auto_declined. Без notify (не е в D4).
  static async autoComplete(): Promise<{ completed: number; autoDeclined: number }> {
    const today = todaySofia();
    const completedRows = await db.update(booking).set({ status: "completed" })
      .where(and(eq(booking.status, "confirmed"), lt(booking.eventDate, today))).returning({ id: booking.id });
    const autoDeclinedRows = await db.update(booking).set({ status: "auto_declined" })
      .where(and(eq(booking.status, "pending"), lt(booking.eventDate, today))).returning({ id: booking.id });
    return { completed: completedRows.length, autoDeclined: autoDeclinedRows.length };
  }
}

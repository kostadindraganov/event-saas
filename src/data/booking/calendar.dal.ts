import "server-only";
import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import { availabilityRule, blockedDate, booking, bookingServiceType, listing, user } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { canManageCalendar } from "./booking.policy";
import { generateDaySlots, weekdayOf } from "./slots";
import type {
  AvailabilityDayDTO, AvailabilityRuleDTO, BlockedDateCreateInput, BlockedDateDTO,
  BookingDTO, ServiceTypeCreateInput, ServiceTypeDTO, ServiceTypeUpdateInput,
  SetAvailabilityInput, SlotDTO,
} from "./booking.dto";

// drizzle-orm/neon-serverless обвива pg грешката — реалният код е в err.cause.code (копирано от admin.dal.ts)
function pgCode(err: unknown): string | undefined {
  return (err as { cause?: { code?: string } })?.cause?.code;
}

type ServiceTypeRow = typeof bookingServiceType.$inferSelect;
type AvailabilityRuleRow = typeof availabilityRule.$inferSelect;
type BlockedDateRow = typeof blockedDate.$inferSelect;

function toServiceTypeDTO(r: ServiceTypeRow): ServiceTypeDTO {
  return {
    id: r.id, listingId: r.listingId, kind: r.kind, name: r.name,
    durationMinutes: r.durationMinutes, priceFromCents: r.priceFromCents, isActive: r.isActive,
  };
}
function toAvailabilityRuleDTO(r: AvailabilityRuleRow): AvailabilityRuleDTO {
  return { id: r.id, listingId: r.listingId, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime };
}
function toBlockedDateDTO(r: BlockedDateRow): BlockedDateDTO {
  return { id: r.id, listingId: r.listingId, date: r.date, note: r.note };
}

// ponytail: локален mapper, умишлено дублиран и в booking.dal.ts (T8) — виж флага в началото на секцията.
function toBookingDTO(r: {
  id: string; listingId: string; listingSlug: string; listingTitle: string;
  serviceTypeId: string; serviceKind: "full_day" | "hourly"; serviceName: string;
  customerId: string; customerName: string; status: BookingDTO["status"]; isFullDay: boolean;
  eventDate: string; startTime: string | null; endTime: string | null; phone: string;
  message: string | null; declineReason: string | null; cancelReason: string | null;
  confirmedAt: Date | null; createdAt: Date;
}): BookingDTO {
  return { ...r };
}

export class CalendarDAL {
  private constructor(private readonly user: SessionUser) {}

  static for(user: SessionUser): CalendarDAL {
    return new CalendarDAL(user);
  }

  static public(): PublicCalendarDAL {
    return new PublicCalendarDAL();
  }

  // choke-point: listing.ownerId → canManageCalendar; NOT_FOUND за чужда/несъществуваща (без enumeration)
  private async ownedListing(listingId: string): Promise<{ id: string; ownerId: string }> {
    const [row] = await db.select({ id: listing.id, ownerId: listing.ownerId }).from(listing).where(eq(listing.id, listingId));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (!canManageCalendar(this.user, row.ownerId)) throw new TRPCError({ code: "FORBIDDEN" });
    return row;
  }

  async listServiceTypes(listingId: string): Promise<ServiceTypeDTO[]> {
    await this.ownedListing(listingId);
    const rows = await db.select().from(bookingServiceType).where(eq(bookingServiceType.listingId, listingId));
    return rows.map(toServiceTypeDTO);
  }

  async createServiceType(input: ServiceTypeCreateInput): Promise<ServiceTypeDTO> {
    await this.ownedListing(input.listingId);
    const [row] = await db.insert(bookingServiceType).values({
      listingId: input.listingId, kind: input.kind, name: input.name,
      durationMinutes: input.durationMinutes ?? null, priceFromCents: input.priceFromCents ?? null,
      isActive: input.isActive ?? true,
    }).returning();
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return toServiceTypeDTO(row);
  }

  async updateServiceType(input: ServiceTypeUpdateInput): Promise<ServiceTypeDTO> {
    await this.ownedListing(input.listingId);
    const [row] = await db.update(bookingServiceType).set({
      kind: input.kind, name: input.name, durationMinutes: input.durationMinutes ?? null,
      priceFromCents: input.priceFromCents ?? null, isActive: input.isActive ?? true,
    }).where(and(eq(bookingServiceType.id, input.id), eq(bookingServiceType.listingId, input.listingId))).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return toServiceTypeDTO(row);
  }

  // guard: услугата не може да се трие, докато има booking, който я реферира (история/одит)
  async deleteServiceType(id: string): Promise<void> {
    const [st] = await db.select({ listingId: bookingServiceType.listingId }).from(bookingServiceType).where(eq(bookingServiceType.id, id));
    if (!st) throw new TRPCError({ code: "NOT_FOUND" });
    await this.ownedListing(st.listingId);
    const [c] = await db.select({ n: count() }).from(booking).where(eq(booking.serviceTypeId, id));
    if ((c?.n ?? 0) > 0) throw new TRPCError({ code: "CONFLICT", message: "SERVICE_TYPE_IN_USE" });
    await db.delete(bookingServiceType).where(eq(bookingServiceType.id, id));
  }

  async getAvailability(listingId: string): Promise<AvailabilityRuleDTO[]> {
    await this.ownedListing(listingId);
    const rows = await db.select().from(availabilityRule).where(eq(availabilityRule.listingId, listingId)).orderBy(asc(availabilityRule.weekday));
    return rows.map(toAvailabilityRuleDTO);
  }

  // replace-all в tx: vendor UI праща цялото разписание наведнъж — изтрий старото, вкарай новото
  async setAvailability(input: SetAvailabilityInput): Promise<AvailabilityRuleDTO[]> {
    await this.ownedListing(input.listingId);
    return db.transaction(async (tx) => {
      await tx.delete(availabilityRule).where(eq(availabilityRule.listingId, input.listingId));
      if (input.rules.length === 0) return [];
      const rows = await tx.insert(availabilityRule).values(
        input.rules.map((r) => ({ listingId: input.listingId, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
      ).returning();
      return rows.map(toAvailabilityRuleDTO);
    });
  }

  async listBlockedDates(listingId: string): Promise<BlockedDateDTO[]> {
    await this.ownedListing(listingId);
    const rows = await db.select().from(blockedDate).where(eq(blockedDate.listingId, listingId)).orderBy(asc(blockedDate.date));
    return rows.map(toBlockedDateDTO);
  }

  async createBlockedDate(input: BlockedDateCreateInput): Promise<BlockedDateDTO> {
    await this.ownedListing(input.listingId);
    try {
      const [row] = await db.insert(blockedDate).values({ listingId: input.listingId, date: input.date, note: input.note ?? null }).returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return toBlockedDateDTO(row);
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "DATE_ALREADY_BLOCKED" });
      throw err;
    }
  }

  async deleteBlockedDate(id: string): Promise<void> {
    const [bd] = await db.select({ listingId: blockedDate.listingId }).from(blockedDate).where(eq(blockedDate.id, id));
    if (!bd) throw new TRPCError({ code: "NOT_FOUND" });
    await this.ownedListing(bd.listingId);
    await db.delete(blockedDate).where(eq(blockedDate.id, id));
  }

  // Bookings по обявите на ТОЗИ owner — "моят календар", не admin модерация (без isAdmin bypass).
  async listIncoming(): Promise<BookingDTO[]> {
    const rows = await db
      .select({
        id: booking.id, listingId: booking.listingId, listingSlug: listing.slug, listingTitle: listing.title,
        serviceTypeId: booking.serviceTypeId, serviceKind: bookingServiceType.kind, serviceName: bookingServiceType.name,
        customerId: booking.customerId, customerName: user.name, status: booking.status, isFullDay: booking.isFullDay,
        eventDate: booking.eventDate, startTime: booking.startTime, endTime: booking.endTime, phone: booking.phone,
        message: booking.message, declineReason: booking.declineReason, cancelReason: booking.cancelReason,
        confirmedAt: booking.confirmedAt, createdAt: booking.createdAt,
      })
      .from(booking)
      .innerJoin(listing, eq(booking.listingId, listing.id))
      .innerJoin(bookingServiceType, eq(booking.serviceTypeId, bookingServiceType.id))
      .innerJoin(user, eq(booking.customerId, user.id))
      .where(eq(listing.ownerId, this.user.id))
      .orderBy(desc(booking.createdAt));
    return rows.map(toBookingDTO);
  }
}

// Публични календарни четения — БЕЗ ownership guard (публична обява страница). Отделен клас без user,
// огледално на PublicListingDAL (listing.dal.ts). Връщан от CalendarDAL.public().
export class PublicCalendarDAL {
  // D10: ден е "free" ако ПОНЕ едно от предлаганите видове услуги е бронируемо тази дата.
  async availabilityMonth(listingId: string, year: number, month: number): Promise<AvailabilityDayDTO[]> {
    const [l] = await db.select({ id: listing.id }).from(listing).where(eq(listing.id, listingId));
    if (!l) throw new TRPCError({ code: "NOT_FOUND" });

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const pad = (n: number) => String(n).padStart(2, "0");
    const monthStart = `${year}-${pad(month)}-01`;
    const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;

    const [serviceTypes, rules, blocked, confirmed] = await Promise.all([
      db.select({ kind: bookingServiceType.kind, durationMinutes: bookingServiceType.durationMinutes })
        .from(bookingServiceType)
        .where(and(eq(bookingServiceType.listingId, listingId), eq(bookingServiceType.isActive, true))),
      db.select({ weekday: availabilityRule.weekday, startTime: availabilityRule.startTime, endTime: availabilityRule.endTime })
        .from(availabilityRule).where(eq(availabilityRule.listingId, listingId)),
      db.select({ date: blockedDate.date }).from(blockedDate)
        .where(and(eq(blockedDate.listingId, listingId), gte(blockedDate.date, monthStart), lte(blockedDate.date, monthEnd))),
      db.select({ eventDate: booking.eventDate, isFullDay: booking.isFullDay, startTime: booking.startTime, endTime: booking.endTime })
        .from(booking)
        .where(and(
          eq(booking.listingId, listingId), eq(booking.status, "confirmed"),
          gte(booking.eventDate, monthStart), lte(booking.eventDate, monthEnd),
        )),
    ]);

    const hasFullDay = serviceTypes.some((s) => s.kind === "full_day");
    const hourlyDurations = serviceTypes.filter((s) => s.kind === "hourly" && s.durationMinutes).map((s) => s.durationMinutes!);
    const blockedSet = new Set(blocked.map((b) => b.date));
    const fullDayConfirmedSet = new Set(confirmed.filter((c) => c.isFullDay).map((c) => c.eventDate));
    const hourlyByDate = new Map<string, { startTime: string; endTime: string }[]>();
    for (const c of confirmed) {
      if (c.isFullDay || !c.startTime || !c.endTime) continue;
      const list = hourlyByDate.get(c.eventDate) ?? [];
      list.push({ startTime: c.startTime, endTime: c.endTime });
      hourlyByDate.set(c.eventDate, list);
    }

    const result: AvailabilityDayDTO[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${pad(month)}-${pad(d)}`;
      const blockedDay = blockedSet.has(date);
      const confirmedFullDay = fullDayConfirmedSet.has(date);
      let free = hasFullDay && !blockedDay && !confirmedFullDay;
      if (!free && hourlyDurations.length > 0) {
        const dayRules = rules.filter((r) => r.weekday === weekdayOf(date));
        const confirmedHourly = hourlyByDate.get(date) ?? [];
        for (const durationMinutes of hourlyDurations) {
          const slots = generateDaySlots({ rules: dayRules, durationMinutes, blocked: blockedDay, confirmedFullDay, confirmedHourly });
          if (slots.length > 0) { free = true; break; }
        }
      }
      result.push({ date, state: free ? "free" : "busy" });
    }
    return result;
  }

  async slotsDay(listingId: string, serviceTypeId: string, date: string): Promise<SlotDTO[]> {
    const [st] = await db
      .select({
        listingId: bookingServiceType.listingId, kind: bookingServiceType.kind,
        durationMinutes: bookingServiceType.durationMinutes, isActive: bookingServiceType.isActive,
      })
      .from(bookingServiceType).where(eq(bookingServiceType.id, serviceTypeId));
    if (!st || st.listingId !== listingId || !st.isActive || st.kind !== "hourly" || !st.durationMinutes) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const weekday = weekdayOf(date);
    const [rules, blockedRows, confirmed] = await Promise.all([
      db.select({ startTime: availabilityRule.startTime, endTime: availabilityRule.endTime })
        .from(availabilityRule).where(and(eq(availabilityRule.listingId, listingId), eq(availabilityRule.weekday, weekday))),
      db.select({ id: blockedDate.id }).from(blockedDate).where(and(eq(blockedDate.listingId, listingId), eq(blockedDate.date, date))),
      db.select({ isFullDay: booking.isFullDay, startTime: booking.startTime, endTime: booking.endTime })
        .from(booking).where(and(eq(booking.listingId, listingId), eq(booking.status, "confirmed"), eq(booking.eventDate, date))),
    ]);

    const confirmedFullDay = confirmed.some((c) => c.isFullDay);
    const confirmedHourly = confirmed
      .filter((c) => !c.isFullDay && c.startTime && c.endTime)
      .map((c) => ({ startTime: c.startTime!, endTime: c.endTime! }));

    return generateDaySlots({ rules, durationMinutes: st.durationMinutes, blocked: blockedRows.length > 0, confirmedFullDay, confirmedHourly });
  }

  async listActiveServiceTypes(listingId: string): Promise<ServiceTypeDTO[]> {
    const rows = await db.select().from(bookingServiceType)
      .where(and(eq(bookingServiceType.listingId, listingId), eq(bookingServiceType.isActive, true)));
    return rows.map(toServiceTypeDTO);
  }
}

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { availabilityRule, blockedDate, booking } from "@/db/schema";
import { generateDaySlots, splitConfirmed, weekdayOf } from "./slots";
import type { SlotDTO } from "./booking.dto";

// Дълбокият availability модул: КОИ часови слотове реално предлага обявата на дата.
// Единствената дефиниция на fetch (разписание + блокирани + потвърдени) → split → generate;
// ползва се и read-side (PublicCalendarDAL.slotsDay), и write-side (BookingDAL.request choke-point).
export async function offeredSlots(listingId: string, durationMinutes: number, date: string): Promise<SlotDTO[]> {
  const weekday = weekdayOf(date);
  const [rules, blockedRows, confirmed] = await Promise.all([
    db.select({ startTime: availabilityRule.startTime, endTime: availabilityRule.endTime })
      .from(availabilityRule)
      .where(and(eq(availabilityRule.listingId, listingId), eq(availabilityRule.weekday, weekday))),
    db.select({ id: blockedDate.id }).from(blockedDate)
      .where(and(eq(blockedDate.listingId, listingId), eq(blockedDate.date, date))),
    db.select({ isFullDay: booking.isFullDay, startTime: booking.startTime, endTime: booking.endTime })
      .from(booking)
      .where(and(eq(booking.listingId, listingId), eq(booking.status, "confirmed"), eq(booking.eventDate, date))),
  ]);
  return generateDaySlots({
    rules, durationMinutes, blocked: blockedRows.length > 0, ...splitConfirmed(confirmed),
  });
}

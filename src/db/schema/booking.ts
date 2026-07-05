import {
  boolean, date, integer, pgEnum, pgTable, text, time, timestamp,
  uniqueIndex, unique, uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { listing } from "./catalog";

export const serviceKind = pgEnum("service_kind", ["full_day", "hourly"]);
export const bookingStatus = pgEnum("booking_status", [
  "pending", "confirmed", "declined", "auto_declined",
  "completed", "cancelled_by_customer", "cancelled_by_vendor",
]);

export const bookingServiceType = pgTable("booking_service_type", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  kind: serviceKind("kind").notNull(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes"), // само за hourly
  priceFromCents: integer("price_from_cents"),
  isActive: boolean("is_active").notNull().default(true),
});

export const availabilityRule = pgTable("availability_rule", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  weekday: integer("weekday").notNull(), // 0=понеделник … 6=неделя
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
});

export const blockedDate = pgTable(
  "blocked_date",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    note: text("note"),
  },
  (t) => [unique().on(t.listingId, t.date)],
);

export const booking = pgTable(
  "booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => listing.id),
    serviceTypeId: uuid("service_type_id").notNull().references(() => bookingServiceType.id),
    customerId: text("customer_id").notNull().references(() => user.id),
    status: bookingStatus("status").notNull().default("pending"),
    // денормализирано от serviceType.kind — нужно за partial unique index-а
    isFullDay: boolean("is_full_day").notNull(),
    eventDate: date("event_date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    phone: text("phone").notNull(),
    message: text("message"),
    declineReason: text("decline_reason"),
    cancelReason: text("cancel_reason"),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // DB-гаранция срещу double-booking (Tech Spec §4 ⭐)
    uniqueIndex("booking_confirmed_full_day_unique")
      .on(t.listingId, t.eventDate)
      .where(sql`${t.status} = 'confirmed' and ${t.isFullDay} = true`),
  ],
);

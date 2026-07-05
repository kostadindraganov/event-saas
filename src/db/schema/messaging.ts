import { date, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { listing } from "./catalog";

export const thread = pgTable(
  "thread",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => listing.id),
    customerId: text("customer_id").notNull().references(() => user.id),
    vendorId: text("vendor_id").notNull().references(() => user.id), // denorm от listing.ownerId
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.listingId, t.customerId)],
);

export const message = pgTable("message", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => thread.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  eventDate: date("event_date"), // само на първото съобщение (запитването)
  phone: text("phone"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

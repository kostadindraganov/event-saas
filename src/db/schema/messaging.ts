import { date, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
  (t) => [
    unique().on(t.listingId, t.customerId),
    index("thread_vendor_idx").on(t.vendorId, t.lastMessageAt.desc()),
    index("thread_customer_idx").on(t.customerId, t.lastMessageAt.desc()),
  ],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id").notNull().references(() => thread.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => user.id),
    body: text("body").notNull(),
    eventDate: date("event_date"), // само на първото съобщение (запитването)
    phone: text("phone"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_thread_idx").on(t.threadId, t.createdAt),
    index("message_sender_idx").on(t.senderId, t.threadId, t.createdAt),
  ],
);

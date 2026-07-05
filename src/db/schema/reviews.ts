import {
  boolean, date, numeric, pgEnum, pgTable, smallint, text, timestamp, uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { listing } from "./catalog";
import { booking } from "./booking";

export const contentStatus = pgEnum("content_status", [
  "visible", "hidden_by_admin", "removed",
]);
export const reportTargetType = pgEnum("report_target_type", [
  "review", "question", "listing",
]);
export const reportStatus = pgEnum("report_status", ["open", "resolved"]);

export const review = pgTable("review", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().unique().references(() => booking.id),
  listingId: uuid("listing_id").notNull().references(() => listing.id),
  authorId: text("author_id").notNull().references(() => user.id),
  ratingQuality: smallint("rating_quality").notNull(),
  ratingCommunication: smallint("rating_communication").notNull(),
  ratingProfessionalism: smallint("rating_professionalism").notNull(),
  ratingValue: smallint("rating_value").notNull(),
  ratingFlexibility: smallint("rating_flexibility").notNull(),
  ratingOverall: numeric("rating_overall", { precision: 3, scale: 2 }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  wouldRecommend: boolean("would_recommend").notNull(),
  eventDate: date("event_date").notNull(),
  replyText: text("reply_text"),
  replyUpdatedAt: timestamp("reply_updated_at"),
  editableUntil: timestamp("editable_until").notNull(), // createdAt + 48ч
  status: contentStatus("status").notNull().default("visible"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reviewImage = pgTable("review_image", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewId: uuid("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  cfImageId: text("cf_image_id").notNull(),
});

export const question = pgTable("question", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id),
  body: text("body").notNull(),
  answerText: text("answer_text"),
  answeredAt: timestamp("answered_at"),
  status: contentStatus("status").notNull().default("visible"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  targetType: reportTargetType("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reporterId: text("reporter_id").notNull().references(() => user.id),
  reason: text("reason").notNull(),
  status: reportStatus("status").notNull().default("open"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

import {
  boolean, integer, jsonb, numeric, pgEnum, pgTable, primaryKey,
  text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const listingStatus = pgEnum("listing_status", [
  "draft", "pending_approval", "published", "hidden", "rejected", "removed",
]);
export const attributeType = pgEnum("attribute_type", [
  "single", "multi", "number", "boolean",
]);
export const promotionSource = pgEnum("promotion_source", [
  "premium_included", "purchased",
]);

export const category = pgTable("category", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  nameBg: text("name_bg").notNull(),
  nameEn: text("name_en").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const region = pgTable("region", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const city = pgTable(
  "city",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    regionId: uuid("region_id").notNull().references(() => region.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
  },
  (t) => [unique().on(t.regionId, t.slug)],
);

export const listing = pgTable("listing", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  categoryId: uuid("category_id").notNull().references(() => category.id),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  cityId: uuid("city_id").notNull().references(() => city.id),
  wholeCountry: boolean("whole_country").notNull().default(false),
  status: listingStatus("status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  // кеширани агрегати (преизчисляват се при ново ревю / промяна на пакети)
  priceFromCents: integer("price_from_cents"),
  ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").notNull().default(0),
  // ponytail: без FK към listing_image (циклична зависимост); интегритетът се пази в DAL-а
  coverImageId: uuid("cover_image_id"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const listingServiceRegion = pgTable(
  "listing_service_region",
  {
    listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
    regionId: uuid("region_id").notNull().references(() => region.id),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.regionId] })],
);

export const attributeDefinition = pgTable(
  "attribute_definition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => category.id),
    key: text("key").notNull(),
    labelBg: text("label_bg").notNull(),
    labelEn: text("label_en").notNull(),
    type: attributeType("type").notNull(),
    options: jsonb("options"), // [{value, labelBg, labelEn}] за single/multi
    showAsFilter: boolean("show_as_filter").notNull().default(false),
    showAsChip: boolean("show_as_chip").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [unique().on(t.categoryId, t.key)],
);

export const listingAttribute = pgTable(
  "listing_attribute",
  {
    listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
    attributeDefinitionId: uuid("attribute_definition_id").notNull().references(() => attributeDefinition.id),
    value: jsonb("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.listingId, t.attributeDefinitionId] })],
);

export const album = pgTable("album", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const listingImage = pgTable("listing_image", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  albumId: uuid("album_id").references(() => album.id, { onDelete: "set null" }),
  cfImageId: text("cf_image_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const listingVideo = pgTable("listing_video", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  youtubeId: text("youtube_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const servicePackage = pgTable("service_package", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceFromCents: integer("price_from_cents").notNull(),
  duration: text("duration"),
  included: text("included"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const savedListing = pgTable(
  "saved_listing",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);

export const promotion = pgTable("promotion", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listing.id, { onDelete: "cascade" }),
  source: promotionSource("source").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(), // календарен прозорец — тече и при скрита обява
  polarOrderId: text("polar_order_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

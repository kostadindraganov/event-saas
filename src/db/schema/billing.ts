import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

export const plan = pgEnum("plan", ["standard", "premium"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "active", "past_due", "canceled", "revoked",
]);

// Проекция от Polar webhooks — истината живее при Polar
export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().unique().references(() => user.id),
    polarSubscriptionId: text("polar_subscription_id").notNull().unique(),
    plan: plan("plan").notNull(),
    status: subscriptionStatus("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    graceUntil: timestamp("grace_until"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("subscription_past_due_idx").on(t.graceUntil).where(sql`${t.status} = 'past_due'`),
  ],
);

export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

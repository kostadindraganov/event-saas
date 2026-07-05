# M0 Foundation Implementation Plan (DB-first)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Работещ скелет на EVENT-REVIEW по DB-first ред: пълната база (всички домейн схеми + миграция + seed) първо, после auth, tRPC, i18n, дизайн, deploy.

**Architecture:** Един Next.js monolith (App Router). tRPC е единствената клиентска граница (без Server Actions — ADR 0002); RSC четат DAL директно. Само `src/db` + DAL файлове пипат Drizzle. Пълен контекст: `Docs/superpowers/specs/2026-07-06-event-review-tech-spec.md`, `CONTEXT.md`, `docs/adr/0001–0004`.

**Tech Stack:** Next.js (latest, standalone), TypeScript strict, Tailwind v4 + shadcn/ui, Drizzle + Neon (`neon-serverless` Pool), Better Auth, tRPC v11 + TanStack Query, next-intl, Zod v4, Vitest, pnpm, Docker.

**Модели за subagents:** всяка задача носи `Модел:` препоръка — haiku (механична), sonnet (средна), opus (сложна/критична).

## Global Constraints

- Пакетен мениджър: **pnpm**. Инсталирай винаги с `@latest`.
- TypeScript **strict: true** + `noUncheckedIndexedAccess: true`. Никакъв `any`.
- **Никакви Server Actions** (ADR 0002). Никакъв Prisma (ADR 0001).
- Файловете в `src/data/` и `src/db/` започват с `import "server-only";` (освен чисти Zod DTO / policy модули — те са тестваеми без сървър).
- Drizzle клиент: само `drizzle-orm/neon-serverless` с `Pool` (транзакции — ADR 0003).
- **FK към потребител е `text`** — Better Auth генерира text id-та.
- Локали: `bg` (default, БЕЗ префикс) + `en` (`/en`). Валута EUR; парите се пазят в **integer центове** (`*_cents`).
- Дизайн токени (Tech Spec §7): bg `#FAFAF9`/dark `#0C0A09`, fg `#1C1917`, primary `#9F1239`/dark `#FB7185`, gold `#A16207`, border `#E7E5E4`, radius 12px; Cormorant + Inter (subsets latin+cyrillic).
- Commit-и: conventional commits.
- **CODE STANDARDS (задължителни):** SOLID, Clean Architecture, DRY, KISS. Картиране: Repository Pattern = `*.dal.ts` (единственият слой с Drizzle, връща само DTO-та); Service Layer = `*.service.ts` (само при многостъпкова оркестрация); DTO + Validation = `*.dto.ts` (Zod схеми, преизползвани в tRPC `.input()`); Policies + Authorization = `*.policy.ts` (чисти функции) + tRPC процедурни нива; Reusable Components = `src/components/`; Type Safety = strict TS, никакъв `any`, tRPC end-to-end типове. Никакъв "quick and dirty" код; никакви спекулативни абстракции (KISS печели пред преждевременна гъвкавост).

---

### Task 1: Project scaffold (Next.js + TS strict + Vitest) — Модел: haiku

**Files:**
- Create: Next.js дърво в repo root (scaffold + преместване), `vitest.config.ts`
- Modify: `tsconfig.json`, `.gitignore`

**Interfaces:**
- Produces: `pnpm dev`/`pnpm build`/`pnpm test`; alias `@/*` → `src/*`.

- [ ] **Step 1: Scaffold в темп директория и премести** (root-ът не е празен)

```bash
cd /Users/cyberkoko/Desktop/EVENT-REVIEW
pnpm create next-app@latest .scaffold --ts --app --src-dir --tailwind --eslint --turbopack --import-alias "@/*" --use-pnpm --yes
rsync -a --exclude README.md .scaffold/ .
rm -rf .scaffold
pnpm install
```

- [ ] **Step 2: Затегни tsconfig** — `compilerOptions` да съдържа:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "forceConsistentCasingInFileNames": true
}
```

- [ ] **Step 3: Vitest**

```bash
pnpm add -D vitest @vitejs/plugin-react
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Санити тест** — `src/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("toolchain works", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Провери**

Run: `pnpm test && pnpm build`
Expected: PASS + чист build.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with strict TS and Vitest"
```

---

### Task 2: `.env` с всички променливи + Drizzle/Neon клиент — Модел: haiku

**Files:**
- Create: `.env`, `.env.example`, `src/db/index.ts`, `src/db/schema/index.ts`, `drizzle.config.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `import { db } from "@/db"`; `pnpm db:generate/db:migrate/db:studio`; попълнен `.env` (секретите генерирани, външните ключове празни с коментар кога трябват).

- [ ] **Step 1: Инсталирай**

```bash
pnpm add drizzle-orm @neondatabase/serverless ws
pnpm add -D drizzle-kit dotenv tsx
```

- [ ] **Step 2: Създай `.env.example`** (пълният списък за целия проект):

```bash
# ── База (Neon, EU регион) — pooled connection string ── НУЖНО ОТ Task 4
DATABASE_URL=

# ── Better Auth ── НУЖНО ОТ Task 5
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Cron endpoints ── НУЖНО ОТ Task 9
CRON_SECRET=

# ── Cloudflare Images ── НУЖНО ОТ Фаза 1 (M1.1)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_IMAGES_API_TOKEN=
CLOUDFLARE_IMAGES_ACCOUNT_HASH=

# ── Resend ── НУЖНО ОТ Фаза 1 (M1.3)
RESEND_API_KEY=
EMAIL_FROM=

# ── Polar ── НУЖНО ОТ Фаза 2
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_ENV=sandbox
```

- [ ] **Step 3: Създай `.env`** — копие на example с генерирани секрети:

```bash
cp .env.example .env
python3 - << 'EOF'
import secrets, re
s = open('.env').read()
s = s.replace('BETTER_AUTH_SECRET=', 'BETTER_AUTH_SECRET=' + secrets.token_hex(32))
s = s.replace('CRON_SECRET=', 'CRON_SECRET=' + secrets.token_hex(32))
open('.env','w').write(s)
EOF
grep -q "^\.env$" .gitignore || echo ".env" >> .gitignore
```

(`DATABASE_URL` се попълва от човека — Neon проект в EU регион.)

- [ ] **Step 4: `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Клиент** — `src/db/schema/index.ts` (barrel, попълва се в Task 3):

```ts
export {};
```

`src/db/index.ts`:

```ts
import "server-only";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// ponytail: Node runtime няма вграден WebSocket за Pool
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

- [ ] **Step 6: Scripts** — `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio",
"db:seed": "tsx scripts/seed.ts"
```

- [ ] **Step 7: Провери** — `pnpm build` минава (без DB връзка още).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: env template + drizzle/neon client + migration scripts"
```

---

### Task 3: Пълна DB схема — всички домейни — Модел: opus

**Files:**
- Create: `src/db/schema/auth.ts` (генериран + разширен), `src/db/schema/catalog.ts`, `src/db/schema/booking.ts`, `src/db/schema/reviews.ts`, `src/db/schema/billing.ts`, `src/db/schema/messaging.ts`
- Modify: `src/db/schema/index.ts`, `src/lib/auth.ts` (минимален config за CLI генерацията)

**Interfaces:**
- Produces: пълната схема от Tech Spec §4/§9 като Drizzle таблици; barrel re-export; компилира се чисто. Миграцията се пуска в Task 4.

- [ ] **Step 1: Better Auth config + генерирай auth схемата**

```bash
pnpm add better-auth
```

Минимален `src/lib/auth.ts` (разширява се в Task 5):

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      isAdmin: { type: "boolean", defaultValue: false, input: false },
      phone: { type: "string", required: false },
    },
  },
});
```

```bash
pnpm dlx @better-auth/cli@latest generate --config src/lib/auth.ts --output src/db/schema/auth.ts
```

После в `src/db/schema/auth.ts` добави към `user` таблицата:

```ts
deletedAt: timestamp("deleted_at"),
avgResponseMinutes: integer("avg_response_minutes"),
```

- [ ] **Step 2: `src/db/schema/catalog.ts`**

```ts
import {
  boolean, date, integer, jsonb, numeric, pgEnum, pgTable, primaryKey,
  text, time, timestamp, unique, uuid,
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
```

- [ ] **Step 3: `src/db/schema/booking.ts`**

```ts
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
```

- [ ] **Step 4: `src/db/schema/reviews.ts`**

```ts
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
```

- [ ] **Step 5: `src/db/schema/billing.ts` и `src/db/schema/messaging.ts`**

`billing.ts`:

```ts
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const plan = pgEnum("plan", ["standard", "premium"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "active", "past_due", "canceled", "revoked",
]);

// Проекция от Polar webhooks — истината живее при Polar
export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique().references(() => user.id),
  polarSubscriptionId: text("polar_subscription_id").notNull().unique(),
  plan: plan("plan").notNull(),
  status: subscriptionStatus("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  graceUntil: timestamp("grace_until"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
```

`messaging.ts`:

```ts
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
```

- [ ] **Step 6: Barrel** — `src/db/schema/index.ts`:

```ts
export * from "./auth";
export * from "./catalog";
export * from "./booking";
export * from "./reviews";
export * from "./billing";
export * from "./messaging";
```

- [ ] **Step 7: Провери компилация + генерирай миграцията**

Run: `pnpm build && pnpm db:generate`
Expected: build чист; в `drizzle/` се появява `0000_*.sql`, съдържащ всички таблици + `booking_confirmed_full_day_unique` partial index (провери с `grep -n "confirmed" drizzle/0000_*.sql`).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: full drizzle schema (auth/catalog/booking/reviews/billing/messaging) + initial migration"
```

---

### Task 4: Миграция + seed (17 категории, 28 области) — Модел: sonnet

**Files:**
- Create: `scripts/seed-data.ts`, `scripts/seed.ts`, `src/db/seed-data.test.ts`

**Interfaces:**
- Consumes: схемата от Task 3; реален `DATABASE_URL` в `.env` (⛔ BLOCKER: изисква Neon проект — човекът го създава).
- Produces: мигрирана база; `pnpm db:seed` — идемпотентен; `CATEGORIES`/`REGIONS` константи.

- [ ] **Step 1: Failing тест** — `src/db/seed-data.test.ts`:

```ts
import { expect, test } from "vitest";
import { CATEGORIES, REGIONS } from "../../scripts/seed-data";

test("17 категории с уникални slug-ове", () => {
  expect(CATEGORIES).toHaveLength(17);
  expect(new Set(CATEGORIES.map((c) => c.slug)).size).toBe(17);
});

test("28 области с уникални slug-ове и по един град", () => {
  expect(REGIONS).toHaveLength(28);
  expect(new Set(REGIONS.map((r) => r.slug)).size).toBe(28);
  for (const r of REGIONS) expect(r.city.slug.length).toBeGreaterThan(0);
});
```

Run: `pnpm test` → Expected: FAIL (`seed-data` не съществува).

- [ ] **Step 2: `scripts/seed-data.ts`**

```ts
export const CATEGORIES = [
  { slug: "fotografi", nameBg: "Фотографи", nameEn: "Photographers" },
  { slug: "videografi", nameBg: "Видеографи", nameEn: "Videographers" },
  { slug: "dj", nameBg: "DJ", nameEn: "DJs" },
  { slug: "vodeshti", nameBg: "Водещи", nameEn: "Hosts & MCs" },
  { slug: "restoranti", nameBg: "Ресторанти", nameEn: "Restaurants" },
  { slug: "hoteli", nameBg: "Хотели", nameEn: "Hotels" },
  { slug: "svatbeni-zali", nameBg: "Сватбени зали", nameEn: "Wedding venues" },
  { slug: "dekoratori", nameBg: "Декоратори", nameEn: "Decorators" },
  { slug: "floristi", nameBg: "Флористи", nameEn: "Florists" },
  { slug: "sladkarnitsi", nameBg: "Сладкарници", nameEn: "Cake shops" },
  { slug: "grimyori", nameBg: "Гримьори", nameEn: "Makeup artists" },
  { slug: "frizyori", nameBg: "Фризьори", nameEn: "Hair stylists" },
  { slug: "roklia-dizayneri", nameBg: "Дизайнери на рокли", nameEn: "Dress designers" },
  { slug: "kostyumi", nameBg: "Костюми", nameEn: "Suits" },
  { slug: "transport", nameBg: "Транспорт", nameEn: "Transport" },
  { slug: "svatbeni-agentsii", nameBg: "Сватбени агенции", nameEn: "Wedding planners" },
  { slug: "drugi", nameBg: "Други сватбени услуги", nameEn: "Other wedding services" },
] as const;

export const REGIONS = [
  { slug: "blagoevgrad", name: "Благоевград", city: { slug: "blagoevgrad", name: "Благоевград" } },
  { slug: "burgas", name: "Бургас", city: { slug: "burgas", name: "Бургас" } },
  { slug: "varna", name: "Варна", city: { slug: "varna", name: "Варна" } },
  { slug: "veliko-tarnovo", name: "Велико Търново", city: { slug: "veliko-tarnovo", name: "Велико Търново" } },
  { slug: "vidin", name: "Видин", city: { slug: "vidin", name: "Видин" } },
  { slug: "vratsa", name: "Враца", city: { slug: "vratsa", name: "Враца" } },
  { slug: "gabrovo", name: "Габрово", city: { slug: "gabrovo", name: "Габрово" } },
  { slug: "dobrich", name: "Добрич", city: { slug: "dobrich", name: "Добрич" } },
  { slug: "kardzhali", name: "Кърджали", city: { slug: "kardzhali", name: "Кърджали" } },
  { slug: "kyustendil", name: "Кюстендил", city: { slug: "kyustendil", name: "Кюстендил" } },
  { slug: "lovech", name: "Ловеч", city: { slug: "lovech", name: "Ловеч" } },
  { slug: "montana", name: "Монтана", city: { slug: "montana", name: "Монтана" } },
  { slug: "pazardzhik", name: "Пазарджик", city: { slug: "pazardzhik", name: "Пазарджик" } },
  { slug: "pernik", name: "Перник", city: { slug: "pernik", name: "Перник" } },
  { slug: "pleven", name: "Плевен", city: { slug: "pleven", name: "Плевен" } },
  { slug: "plovdiv", name: "Пловдив", city: { slug: "plovdiv", name: "Пловдив" } },
  { slug: "razgrad", name: "Разград", city: { slug: "razgrad", name: "Разград" } },
  { slug: "ruse", name: "Русе", city: { slug: "ruse", name: "Русе" } },
  { slug: "silistra", name: "Силистра", city: { slug: "silistra", name: "Силистра" } },
  { slug: "sliven", name: "Сливен", city: { slug: "sliven", name: "Сливен" } },
  { slug: "smolyan", name: "Смолян", city: { slug: "smolyan", name: "Смолян" } },
  { slug: "sofia-grad", name: "София-град", city: { slug: "sofia", name: "София" } },
  { slug: "sofia-oblast", name: "София-област", city: { slug: "samokov", name: "Самоков" } },
  { slug: "stara-zagora", name: "Стара Загора", city: { slug: "stara-zagora", name: "Стара Загора" } },
  { slug: "targovishte", name: "Търговище", city: { slug: "targovishte", name: "Търговище" } },
  { slug: "haskovo", name: "Хасково", city: { slug: "haskovo", name: "Хасково" } },
  { slug: "shumen", name: "Шумен", city: { slug: "shumen", name: "Шумен" } },
  { slug: "yambol", name: "Ямбол", city: { slug: "yambol", name: "Ямбол" } },
] as const;
```

Run: `pnpm test` → Expected: PASS.

- [ ] **Step 3: `scripts/seed.ts`**

```ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import ws from "ws";
import { category, region, city } from "../src/db/schema/catalog";
import { CATEGORIES, REGIONS } from "./seed-data";

neonConfig.webSocketConstructor = ws;
const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

async function main() {
  await db
    .insert(category)
    .values(CATEGORIES.map((c, i) => ({ ...c, sortOrder: i })))
    .onConflictDoNothing({ target: category.slug });

  for (const r of REGIONS) {
    await db.insert(region).values({ slug: r.slug, name: r.name }).onConflictDoNothing({ target: region.slug });
    const [row] = await db.select({ id: region.id }).from(region).where(eq(region.slug, r.slug));
    if (!row) throw new Error(`region ${r.slug} missing`);
    await db.insert(city).values({ regionId: row.id, ...r.city }).onConflictDoNothing();
  }
  console.log("seed done");
  process.exit(0);
}

main();
```

- [ ] **Step 4: Мигрирай + seed двукратно (идемпотентност)** — изисква попълнен `DATABASE_URL`:

```bash
pnpm db:migrate && pnpm db:seed && pnpm db:seed
```

Expected: `seed done` ×2 без грешки. Провери бройките:

```bash
pnpm dlx tsx -e "import 'dotenv/config'; import { Pool, neonConfig } from '@neondatabase/serverless'; import ws from 'ws'; neonConfig.webSocketConstructor = ws; const p = new Pool({connectionString: process.env.DATABASE_URL}); p.query(\"select (select count(*) from category) cat, (select count(*) from region) reg, (select count(*) from city) city\").then(r => { console.log(r.rows); process.exit(0); });"
```

Expected: `cat: '17', reg: '28', city: '28'`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: run initial migration + idempotent seed (17 categories, 28 regions)"
```

---

### Task 5: Better Auth wiring (route, client, user DAL) — Модел: sonnet

**Files:**
- Create: `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/data/users/require-user.ts`, `src/data/users/user.policy.ts`, `src/data/users/user.policy.test.ts`
- Modify: `src/lib/auth.ts` (Google + nextCookies)

**Interfaces:**
- Consumes: `auth` от Task 3, мигрираните auth таблици от Task 4.
- Produces: `authClient`; `getCurrentUser(): Promise<SessionUser | null>`, `requireUser()`, `requireAdmin()` — `cache()`-нати; `SessionUser = { id: string; email: string; name: string; isAdmin: boolean }`; `canAdmin(user)`.

- [ ] **Step 1: Разшири `src/lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    additionalFields: {
      isAdmin: { type: "boolean", defaultValue: false, input: false },
      phone: { type: "string", required: false },
    },
  },
  plugins: [nextCookies()],
});
```

- [ ] **Step 2: Route handler** — `src/app/api/auth/[...all]/route.ts`:

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

- [ ] **Step 3: Клиент** — `src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
```

- [ ] **Step 4: Failing policy тест** — `src/data/users/user.policy.test.ts`:

```ts
import { expect, test } from "vitest";
import { canAdmin } from "./user.policy";

test("canAdmin: само isAdmin=true минава", () => {
  expect(canAdmin({ isAdmin: true })).toBe(true);
  expect(canAdmin({ isAdmin: false })).toBe(false);
  expect(canAdmin(null)).toBe(false);
});
```

Run: `pnpm test` → FAIL.

- [ ] **Step 5: `src/data/users/user.policy.ts`** (чист модул, без `server-only` — тестваем):

```ts
type PolicyUser = { isAdmin: boolean };

export function canAdmin(user: PolicyUser | null): boolean {
  return user?.isAdmin === true;
}
```

Run: `pnpm test` → PASS.

- [ ] **Step 6: `src/data/users/require-user.ts`** (шаблонът от `demo/pro-dal-local-main`, адаптиран):

```ts
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { canAdmin } from "./user.policy";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? "",
    isAdmin: (u as { isAdmin?: boolean }).isAdmin ?? false,
  };
});

export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
});

export const requireAdmin = cache(async (): Promise<SessionUser> => {
  const user = await requireUser();
  if (!canAdmin(user)) throw new Error("FORBIDDEN");
  return user;
});
```

- [ ] **Step 7: Провери** — `pnpm test && pnpm build` → PASS/чист.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: better auth wiring (google, next cookies) + user DAL helpers"
```

---

### Task 6: tRPC скелет — Модел: sonnet

**Files:**
- Create: `src/trpc/init.ts`, `src/trpc/routers/_app.ts`, `src/trpc/query-client.ts`, `src/trpc/server.tsx`, `src/trpc/client.tsx`, `src/app/api/trpc/[trpc]/route.ts`, `src/trpc/init.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `SessionUser` (Task 5).
- Produces: `publicProcedure`, `protectedProcedure`, `adminProcedure`; `appRouter`/`AppRouter` (само `health`); `caller`, `trpc`+`HydrateClient`+`prefetch` (RSC); `useTRPC`+`TRPCReactProvider` (client).

- [ ] **Step 1: Инсталирай**

```bash
pnpm add @trpc/server @trpc/client @trpc/tanstack-react-query @tanstack/react-query superjson
```

- [ ] **Step 2: Failing тест** — `src/trpc/init.test.ts`:

```ts
import { expect, test } from "vitest";
import { appRouter } from "./routers/_app";
import { createCallerFactory } from "./init";

const createCaller = createCallerFactory(appRouter);

test("health.ping е публичен", async () => {
  const caller = createCaller({ user: null });
  const res = await caller.health.ping();
  expect(res.ok).toBe(true);
});

test("health.whoami изисква сесия", async () => {
  const caller = createCaller({ user: null });
  await expect(caller.health.whoami()).rejects.toThrow();
  const authed = createCaller({
    user: { id: "u1", email: "a@b.bg", name: "Тест", isAdmin: false },
  });
  await expect(authed.health.whoami()).resolves.toEqual({ id: "u1" });
});
```

Run: `pnpm test` → FAIL.

- [ ] **Step 3: `src/trpc/init.ts`**

```ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { SessionUser } from "@/data/users/require-user";

export type TRPCContext = { user: SessionUser | null };

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isAdmin) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});
```

(ВАЖНО: `init.test.ts` импортва `init.ts`, който импортва само типа `SessionUser` — `import type` не тегли `server-only` в runtime. Не добавяй `server-only` в `init.ts`.)

- [ ] **Step 4: `src/trpc/routers/_app.ts`**

```ts
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";

export const appRouter = createTRPCRouter({
  health: createTRPCRouter({
    ping: publicProcedure.query(() => ({ ok: true as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({ id: ctx.user.id })),
  }),
});

export type AppRouter = typeof appRouter;
```

Run: `pnpm test` → PASS.

- [ ] **Step 5: HTTP handler** — `src/app/api/trpc/[trpc]/route.ts`:

```ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/trpc/routers/_app";
import { getCurrentUser } from "@/data/users/require-user";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => ({ user: await getCurrentUser() }),
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 6: `src/trpc/query-client.ts`**

```ts
import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (q) =>
          defaultShouldDehydrateQuery(q) || q.state.status === "pending",
      },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
}
```

- [ ] **Step 7: RSC helpers** — `src/trpc/server.tsx`:

```tsx
import "server-only";
import { cache } from "react";
import { createTRPCOptionsProxy, type TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { appRouter } from "./routers/_app";
import { getCurrentUser } from "@/data/users/require-user";
import { makeQueryClient } from "./query-client";
import { createCallerFactory } from "./init";

export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  ctx: async () => ({ user: await getCurrentUser() }),
  router: appRouter,
  queryClient: getQueryClient,
});

export const caller = createCallerFactory(appRouter)(async () => ({
  user: await getCurrentUser(),
}));

export function HydrateClient(props: { children: React.ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {props.children}
    </HydrationBoundary>
  );
}

export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(qo: T) {
  void getQueryClient().prefetchQuery(qo);
}
```

- [ ] **Step 8: Client provider** — `src/trpc/client.tsx`:

```tsx
"use client";
import { useState } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { AppRouter } from "./routers/_app";
import { makeQueryClient } from "./query-client";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

Обвий `{children}` в root layout-а с `<TRPCReactProvider>`.

- [ ] **Step 9: Провери**

Run: `pnpm dev` → `curl "http://localhost:3000/api/trpc/health.ping"`
Expected: JSON с `"ok":true`.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: trpc v11 skeleton with public/protected/admin procedures and RSC helpers"
```

---

### Task 7: next-intl (BG default без префикс, /en) — Модел: sonnet

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/request.ts`, `src/middleware.ts`, `messages/bg.json`, `messages/en.json`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`
- Modify: `next.config.ts`; изтрий стария `src/app/page.tsx` / премести layout логиката

**Interfaces:**
- Produces: `Link`/`useRouter`/`usePathname`/`redirect` от `@/i18n/navigation` (ползвай ТЯХ вместо `next/link` за вътрешни линкове); `useTranslations`/`getTranslations`.

- [ ] **Step 1: Инсталирай + плъгин**

```bash
pnpm add next-intl
```

`next.config.ts`:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = { output: "standalone" };

export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Routing файлове** — `src/i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["bg", "en"],
  defaultLocale: "bg",
  localePrefix: "as-needed",
});
```

`src/i18n/navigation.ts`:

```ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
```

`src/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 3: Middleware** — `src/middleware.ts`:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
```

- [ ] **Step 4: Съобщения** — `messages/bg.json`:

```json
{
  "Common": {
    "appName": "EVENT-REVIEW",
    "search": "Търси",
    "signIn": "Вход",
    "signUp": "Регистрация",
    "signOut": "Изход"
  },
  "Home": { "title": "Всички сватбени услуги на едно място" }
}
```

`messages/en.json`:

```json
{
  "Common": {
    "appName": "EVENT-REVIEW",
    "search": "Search",
    "signIn": "Sign in",
    "signUp": "Sign up",
    "signOut": "Sign out"
  },
  "Home": { "title": "All wedding services in one place" }
}
```

- [ ] **Step 5: `[locale]` layout + страница** — `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { TRPCReactProvider } from "@/trpc/client";
import { Cormorant, Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });
const cormorant = Cormorant({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale}>
      <body className={`${inter.variable} ${cormorant.variable} font-sans antialiased`}>
        <NextIntlClientProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("Home");
  return <h1 className="font-serif text-4xl">{t("title")}</h1>;
}
```

Изтрий стария `src/app/page.tsx` и стария root `src/app/layout.tsx` (или го остави като минимален passthrough, ако Next изисква root layout — провери build-а).

- [ ] **Step 6: Провери двата локала**

Run: `pnpm dev`, после:
`curl -s http://localhost:3000/ | grep -c "Всички сватбени услуги"` → `1`
`curl -s http://localhost:3000/en | grep -c "All wedding services"` → `1`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: next-intl with bg default (no prefix) and /en prefix"
```

---

### Task 8: Design tokens + shadcn/ui + шрифтове — Модел: haiku

**Files:**
- Modify: `src/app/globals.css`
- Create: `components.json`, `src/components/ui/*` (button, input, label, card, dropdown-menu, sonner), `src/lib/utils.ts`

**Interfaces:**
- Produces: CSS токени по Tech Spec §7; `font-serif`/`font-sans`; shadcn примитиви.

- [ ] **Step 1: shadcn init + компоненти**

```bash
pnpm dlx shadcn@latest init -y
pnpm dlx shadcn@latest add button input label card dropdown-menu sonner
```

- [ ] **Step 2: Токени в `globals.css`** — замени shadcn стойностите в `:root`/`.dark`:

```css
:root {
  --radius: 0.75rem;
  --background: #fafaf9;
  --foreground: #1c1917;
  --card: #ffffff;
  --card-foreground: #1c1917;
  --primary: #9f1239;
  --primary-foreground: #ffffff;
  --muted: #f5f5f4;
  --muted-foreground: #78716c;
  --border: #e7e5e4;
  --ring: #9f1239;
  --accent-gold: #a16207;
}
.dark {
  --background: #0c0a09;
  --foreground: #fafaf9;
  --card: #1c1917;
  --card-foreground: #fafaf9;
  --primary: #fb7185;
  --primary-foreground: #1c1917;
  --muted: #292524;
  --muted-foreground: #a8a29e;
  --border: #292524;
  --ring: #fb7185;
  --accent-gold: #eab308;
}
```

И в `@theme inline` блока:

```css
--font-sans: var(--font-inter);
--font-serif: var(--font-cormorant);
```

- [ ] **Step 3: Визуална проверка** — на `src/app/[locale]/page.tsx` добави под заглавието `<Button>Резервирай</Button>`.

Run: `pnpm dev` → http://localhost:3000
Expected: serif кирилско заглавие, виненочервен бутон, топло бял фон.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: design tokens, shadcn/ui, Cormorant+Inter fonts"
```

---

### Task 9: Health endpoint + Docker + deploy pipeline — Модел: sonnet

**Files:**
- Create: `src/app/api/health/route.ts`, `Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `GET /api/health` → `{ ok, db }`; docker image на порт 3000; push към `main` → deploy на Hostinger VPS.

- [ ] **Step 1: Health route** — `src/app/api/health/route.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: true });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
```

- [ ] **Step 2: Dockerfile**

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable pnpm

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

`.dockerignore`:

```
node_modules
.next
.git
.env*
Docs
docs
demo
codebase-memory-mcp
```

- [ ] **Step 3: Compose + Caddy** — `deploy/docker-compose.yml`:

```yaml
services:
  app:
    image: event-review:latest
    restart: unless-stopped
    env_file: /opt/event-review/.env
    ports:
      - "127.0.0.1:3000:3000"
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
volumes:
  caddy_data:
```

`deploy/Caddyfile` (домейнът се сменя при закупуване):

```
staging.event-review.example {
    reverse_proxy 127.0.0.1:3000
}
```

- [ ] **Step 4: GitHub Actions** — `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/event-review/repo
            git pull origin main
            docker build -t event-review:latest .
            docker compose -f deploy/docker-compose.yml up -d
            docker image prune -f
```

(Secrets се добавят при провизиране на VPS-а; `/opt/event-review/.env` се създава на сървъра от `.env.example`.)

- [ ] **Step 5: Локална проверка**

```bash
docker build -t event-review:latest .
docker run --rm -d --name er-test -p 3001:3000 --env-file .env event-review:latest
sleep 5 && curl -s http://localhost:3001/api/health && docker stop er-test
```

Expected: `{"ok":true,"db":true}`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: dockerfile, compose+caddy, github actions deploy, health endpoint"
```

---

### Task 10: Auth UI (вход/регистрация) + Header — Модел: sonnet

**Files:**
- Create: `src/app/[locale]/(auth)/vhod/page.tsx`, `src/app/[locale]/(auth)/registratsia/page.tsx`, `src/components/layout/header.tsx`, `src/components/auth/auth-form.tsx`
- Modify: `src/app/[locale]/layout.tsx`, `messages/bg.json`, `messages/en.json`

**Interfaces:**
- Consumes: `authClient` (Task 5), `Link`/`useRouter` от `@/i18n/navigation` (Task 7), shadcn (Task 8).
- Produces: вход/регистрация/изход + Google бутон; `Header` с language switch и session меню.

- [ ] **Step 1: Инсталирай формите**

```bash
pnpm add react-hook-form @hookform/resolvers zod
```

- [ ] **Step 2: Преводи** — в `messages/bg.json` добави:

```json
"Auth": {
  "email": "Имейл",
  "password": "Парола",
  "name": "Име",
  "signInTitle": "Вход",
  "signUpTitle": "Създай акаунт",
  "google": "Продължи с Google",
  "noAccount": "Нямаш акаунт?",
  "haveAccount": "Имаш акаунт?",
  "errorInvalid": "Грешен имейл или парола"
}
```

В `messages/en.json`:

```json
"Auth": {
  "email": "Email",
  "password": "Password",
  "name": "Name",
  "signInTitle": "Sign in",
  "signUpTitle": "Create account",
  "google": "Continue with Google",
  "noAccount": "No account yet?",
  "haveAccount": "Already have an account?",
  "errorInvalid": "Invalid email or password"
}
```

- [ ] **Step 3: Форма** — `src/components/auth/auth-form.tsx`:

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  name: z.string().min(2).optional(),
  email: z.email(),
  password: z.string().min(8),
});
type FormValues = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: "signIn" | "signUp" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [error, setError] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(false);
    const res =
      mode === "signUp"
        ? await authClient.signUp.email({
            email: values.email,
            password: values.password,
            name: values.name ?? "",
          })
        : await authClient.signIn.email({
            email: values.email,
            password: values.password,
          });
    if (res.error) setError(true);
    else router.push("/");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {mode === "signUp" && (
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" {...form.register("name")} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" {...form.register("email")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" type="password" {...form.register("password")} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{t("errorInvalid")}</p>}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {mode === "signUp" ? t("signUpTitle") : t("signInTitle")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
      >
        {t("google")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Страницата за вход** — `src/app/[locale]/(auth)/vhod/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { Link } from "@/i18n/navigation";

export default async function SignInPage() {
  const t = await getTranslations("Auth");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-serif text-3xl">{t("signInTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="signIn" />
          <p className="text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link className="text-primary underline" href="/registratsia">
              {t("signUpTitle")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Страницата за регистрация** — `src/app/[locale]/(auth)/registratsia/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { Link } from "@/i18n/navigation";

export default async function SignUpPage() {
  const t = await getTranslations("Auth");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-serif text-3xl">{t("signUpTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AuthForm mode="signUp" />
          <p className="text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link className="text-primary underline" href="/vhod">
              {t("signInTitle")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 6: Header** — `src/components/layout/header.tsx`:

```tsx
"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function Header() {
  const t = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-serif text-xl font-semibold">
          {t("appName")}
        </Link>
        <nav className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace(pathname, { locale: locale === "bg" ? "en" : "bg" })}
          >
            {locale === "bg" ? "EN" : "БГ"}
          </Button>
          {session ? (
            <Button variant="outline" size="sm" onClick={() => authClient.signOut()}>
              {t("signOut")}
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/vhod">{t("signIn")}</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
```

Добави `<Header />` над `{children}` в `src/app/[locale]/layout.tsx` (вътре в провайдърите).

- [ ] **Step 7: Ръчна E2E проверка** — `pnpm dev`: регистрация → redirect `/` → «Изход» в Header → изход → вход → EN⇄БГ на всяка страница. `session` таблицата в Neon има запис.

- [ ] **Step 8: Финален gate** — `pnpm test && pnpm build` → PASS/чист.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: auth pages (sign in/up + google) and header with locale switch"
```

---

## M0 Definition of Done

- [ ] `pnpm test && pnpm build` минават чисто
- [ ] Neon съдържа ПЪЛНАТА схема (всички домейни) + seed: category(17)/region(28)/city(28)
- [ ] Регистрация/вход/изход работят (email; Google при налични ключове)
- [ ] `/` е на BG, `/en` е на EN
- [ ] `docker build` + `curl /api/health` → `{"ok":true,"db":true}`
- [ ] Push към `main` deploy-ва на VPS (след провизиране на secrets)

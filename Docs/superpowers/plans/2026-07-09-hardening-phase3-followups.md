# Hardening pass (Фаза 3 follow-ups + performance) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Изчистване на натрупания correctness/security/perf дълг (M1.1→M3.3), верифициран срещу текущия код в `.superpowers/sdd/hardening-plan-draft/research-{correctness,performance,quality}.md`.

**Architecture:** Малки, хирургични промени — без нови фичъри. Един migration за всички индекси; correctness фиксовете следват вече установените repo конвенции (NOT_FOUND без enumeration, CAS guards, post-commit revalidate, retry-on-23505).

**Tech Stack:** Next.js 16.2.10 (forked), tRPC v11, Drizzle+Neon, Better Auth, next-intl, vitest.

## Global Constraints

- **Forked Next.js 16.2.10** — `revalidateTag(tag, { expire: 0 })` е двуаргументен; чети `node_modules/next/dist/docs/` при нужда.
- **Repo конвенция за авторизация:** чужд/несъществуващ ресурс → `NOT_FOUND` (SCREAMING_SNAKE), **никога `FORBIDDEN`** (enumeration oracle). Установено в `review-media.dal.ts:14-19`, `review.dal.ts`.
- **DAL:** throw `TRPCError` директно; CAS pattern; side-effects (revalidate) post-commit; `pgCode(err)` за PG кодове (`err.cause.code`; 23505=unique).
- **next-intl parity:** всеки видим низ в **и `bg.json` и `en.json`** (текущо: 568/568, 0 orphans — пази го).
- **Package manager pnpm; vitest.** Всяка промяна с логика → тест преди имплементация (TDD). Индекс-миграциите се верифицират през generate+migrate.
- **Секрети само в `.env`; `git add` конкретни пътища (не `-A`).**
- **Не пипаме (умишлено, документирано):** CF image orphans (accepted, storage-only); rate-limit брои преди zod (self-only blast radius); cat×city composite index + flat `"listings"` cache tag (scalability smell, не bug — при доказан трафик).

---

## File Structure

- `src/db/schema/{reviews,booking,catalog,messaging,auth}.ts` — index декларации.
- `drizzle/0007_*.sql` — авто-генерирана index миграция.
- `src/data/booking/{calendar,booking}.dal.ts` — authz (NOT_FOUND), published-check, past-date guard, serviceType revalidate.
- `src/data/messaging/messaging.dal.ts` — recomputeAvgResponse scoping.
- `src/data/reviews/review.dal.ts` — findReminderTargets LEFT JOIN.
- `src/data/catalog/listing.dal.ts` — uniqueSlug retry-on-conflict.
- `src/data/admin/admin.dal.ts` + router + admin UI — listUsers/listListings пагинация.
- `src/app/api/account/export/route.ts` — rate limit.
- `src/components/messaging/{thread-list,chat-window}.tsx` — isError + markRead re-fire.
- `src/components/ui/{dialog,sheet,button}.tsx` + ~14 компонента — a11y touch targets + aria-labels.
- `messages/{bg,en}.json` — `Common.close`, a11y aria низове, ICU plurals.
- `src/data/billing/billing.dal.test.ts`, `src/app/api/cron/subscriptions/route.test.ts` — test-flake fix.

---

## Task 1: Performance индекси (един migration)

**Files:**
- Modify: `src/db/schema/reviews.ts`, `booking.ts`, `catalog.ts`, `messaging.ts`, `auth.ts`
- Create: `drizzle/0007_*.sql` (авто)

**Interfaces:** няма код промени — само индекси.

Добави следните индекси (Drizzle синтаксис в `(t) => [...]` блока на всяка таблица; имена точни):

| Таблица | Индекс | Причина |
|---|---|---|
| `review` | `(listing_id, status)` + `(author_id)` | recomputeListingRating (write-path) + listByListing + mine — днес 0 индекси |
| `question` | `(listing_id, status)` | listByListing (public) — 0 индекси |
| `booking` | `(listing_id, event_date, status)` + `(customer_id, created_at DESC)` + `(status, event_date)` | публичен календар + slot check + confirm() guard + listMine + autoComplete cron |
| `listing` | `(owner_id)` | 6 vendor-dashboard reads; FK без auto-index |
| `message` | `(sender_id, thread_id, created_at)` | recomputeAvgResponse (write-path, full scan днес) |
| `availability_rule` | `(listing_id)` | всеки календар render — 0 индекси |
| `booking` | `(service_type_id)` | deleteServiceType in-use guard |
| `report` | `(status)` | AdminDAL.listReports |
| `subscription` | `(grace_until) WHERE status='past_due'` (partial) | expireGracePeriods cron |
| `user` | `(created_at DESC)` | listUsers сортиране (Task 6) |

- [ ] **Step 1: Добави индексите** в съответните schema файлове, следвайки съществуващия pattern (напр. `index("review_listing_status_idx").on(t.listingId, t.status)`; за partial — `.where(sql\`${t.status} = 'past_due'\`)`; import `index`, `sql` където липсват). Използвай имена: `review_listing_status_idx`, `review_author_idx`, `question_listing_status_idx`, `booking_listing_date_status_idx`, `booking_customer_idx`, `booking_status_date_idx`, `booking_service_type_idx`, `listing_owner_idx`, `message_sender_idx`, `availability_rule_listing_idx`, `report_status_idx`, `subscription_past_due_idx`, `user_created_at_idx`.

- [ ] **Step 2: Генерирай миграцията.** Run: `pnpm db:generate` → очаквано: `drizzle/0007_*.sql` с само `CREATE INDEX` statements (additive, non-destructive). Прегледай файла — не трябва да има DROP/ALTER на колони.

- [ ] **Step 3: Приложи.** Run: `pnpm db:migrate`.

- [ ] **Step 4: Verify.** `pnpm exec tsc --noEmit` clean; `pnpm test` минава (индексите не променят поведение). 

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/reviews.ts src/db/schema/booking.ts src/db/schema/catalog.ts src/db/schema/messaging.ts src/db/schema/auth.ts drizzle/
git commit -m "perf(hardening): add indexes for hot read + write paths"
```

---

## Task 2: Booking/календар authz + guards (High)

**Files:**
- Modify: `src/data/booking/calendar.dal.ts`, `src/data/booking/booking.dal.ts`
- Test: `src/data/booking/calendar.dal.test.ts`, `booking.dal.test.ts`

**Interfaces:** непроменени сигнатури; само поведение при грешка/staleness.

Три фикса + един revalidate, всичките в тези 2 файла:

**(a) Enumeration oracle → NOT_FOUND (High).** Смени `FORBIDDEN` на `NOT_FOUND` в:
- `calendar.dal.ts:65` (`ownedListing` — чужда обява).
- `booking.dal.ts:200` (`confirm`), `:256` (`decline`), `:275` (`cancel`) — не-участник.
Коментарът в `ownedListing` вече твърди NOT_FOUND — кодът се изравнява с него и с `review-media.dal.ts:14-19`.

**(b) Публичен календар published-check (High).** В `PublicCalendarDAL`:
- `availabilityMonth` (`~176`) — добави `and(eq(listing.id, listingId), eq(listing.status, "published"))`; ако няма ред → `NOT_FOUND`.
- `slotsDay` (`~231`) — добави listing lookup със `status='published'` (днес няма никаква проверка на обявата).
- `listActiveServiceTypes` (`~259`) — добави listing lookup със `status='published'`.

**(c) confirm() past-date guard (Medium).** В `BookingDAL.confirm` след authoritative re-select (`~199-201`), преди CAS: `if (isPastDate(row.eventDate)) throw new TRPCError({ code: "CONFLICT", message: "TOO_LATE" })` — огледално на `cancel()` (`:276`).

**(d) serviceType revalidate (Medium).** В `createServiceType`/`updateServiceType`/`deleteServiceType` върни `listing.slug` (join/select) и post-mutation `revalidateTag(\`listing:${slug}\`, { expire: 0 })` — огледално на `billing.dal.ts:501`.

- [ ] **Step 1: Failing tests.** Добави: chuжда обява/booking → NOT_FOUND (не FORBIDDEN) за ownedListing + confirm/decline/cancel; draft/hidden обява → availabilityMonth/slotsDay/listActiveServiceTypes хвърлят NOT_FOUND; confirm на past-date pending → CONFLICT TOO_LATE; createServiceType вика revalidateTag (mock `next/cache` както в billing/catalog тестовете).

- [ ] **Step 2: Run — fail.** `pnpm test -- booking calendar` → FAIL.

- [ ] **Step 3: Имплементирай** (a)-(d) по-горе. Внимавай: `isPastDate` вече съществува (`booking.dal.ts`, ползван в cancel); `pgCode`/helpers налични.

- [ ] **Step 4: Run tests + tsc** → PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/booking/calendar.dal.ts src/data/booking/booking.dal.ts src/data/booking/calendar.dal.test.ts src/data/booking/booking.dal.test.ts
git commit -m "fix(hardening): booking/calendar authz (NOT_FOUND), published-check, past-date guard, serviceType revalidate"
```

---

## Task 3: Query-efficiency rewrites (write-path/cron full scans)

**Files:**
- Modify: `src/data/messaging/messaging.dal.ts` (`recomputeAvgResponse`), `src/data/reviews/review.dal.ts` (`findReminderTargets`)
- Test: `messaging.dal.test.ts`, `review.dal.test.ts` (запази съществуващите зелени; поведение непроменено)

**Interfaces:** непроменени — само вътрешна ефективност.

**(a) recomputeAvgResponse** (`messaging.dal.ts:235-256`) — днес `avg() GROUP BY thread_id` сканира целия `message` по `sender_id` (без индекс до Task 1). Scope-ни `fv` подзаявката към вече избраните ~50 thread_id-та (`WHERE thread_id = ANY(<selected>)`) вместо глобален GROUP BY. Резултатът трябва да е числено идентичен — само по-малко сканиране.

**(b) findReminderTargets** (`review.dal.ts:225-238`) — днес `SELECT bookingId FROM review` (цялата таблица) + `notInArray(...)`. Замени с `LEFT JOIN review r ON r.booking_id = booking.id ... WHERE booking.status='completed' AND booking.event_date=$1 AND r.id IS NULL` (ползва unique `bookingId` индекса). Резултатът идентичен, без пълен scan + голям параметров масив.

- [ ] **Step 1: Verify съществуващи тестове** покриват двете (avgResponse recompute + reminder targets). Ако не — добави минимален тест че резултатът е същият за seed данни. Run to confirm current green.

- [ ] **Step 2: Rewrite (a) и (b)** запазвайки семантиката. `pnpm test -- messaging review` → PASS (същите резултати).

- [ ] **Step 3: tsc clean. Commit**

```bash
git add src/data/messaging/messaging.dal.ts src/data/reviews/review.dal.ts src/data/messaging/messaging.dal.test.ts src/data/reviews/review.dal.test.ts
git commit -m "perf(hardening): scope recomputeAvgResponse + join-based findReminderTargets"
```

---

## Task 4: uniqueSlug retry-on-conflict + test-flake fix

**Files:**
- Modify: `src/data/catalog/listing.dal.ts` (`createDraft`/`uniqueSlug`)
- Modify: `src/data/billing/billing.dal.test.ts`, `src/app/api/cron/subscriptions/route.test.ts`
- Test: `src/data/catalog/listing.dal.test.ts`

**(a) uniqueSlug TOCTOU (production race).** `createDraft` (`listing.dal.ts:69-78`) прави bare insert без catch. Обвий insert-а: при `pgCode(err) === "23505"` → рекалкулирай следващия свободен слаг (или append суфикс) и retry (bounded, ползвай съществуващия 50-cap). `pgCode` helper е дефиниран в `calendar.dal.ts:16-18`/`booking.dal.ts:16-18` — извади го в споделен util (напр. `src/data/pg.ts`) и внеси го тук (или дублирай ако извличането е извън scope — предпочети extract).

**(b) test-flake.** `expireGracePeriods()` е unscoped global batch; два тест файла assert-ват на return value-то му и се състезават. Изтрий/разхлаби racy assertions: `billing.dal.test.ts:202-204` (`result.hidden`/`result.users` exact membership) и `route.test.ts:81` (`body.hidden` lower bound) — запази DB-state re-select проверките, които вече съществуват веднага след тях (`billing.dal.test.ts:206-208`, `route.test.ts:83-85`). **Без промяна на production код за (b).**

- [ ] **Step 1: Failing test (a)** — два „едновременни" createDraft със същото заглавие → вторият да не хвърля 23505/INTERNAL, а да върне слаг с суфикс (или CONFLICT ако решиш graceful). (Симулирай последователно: seed listing със слаг `base`, после createDraft със същото заглавие → очаквай `base-2`; после ръчно вкарай `base-2` и пак createDraft → `base-3`, доказвайки retry-цикъла срещу реален конфликт.)

- [ ] **Step 2: Run — fail** (ако текущо 23505 bubble-ва или тестът разкрива не-retry). Run: `pnpm test -- listing`.

- [ ] **Step 3: Имплементирай (a)** retry + споделен `pgCode`. Имплементирай (b) изтривайки racy редовете.

- [ ] **Step 4: Run** `pnpm test -- listing billing subscriptions` + пълен `pnpm test` (детерминизъм). tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/catalog/listing.dal.ts src/data/pg.ts src/data/booking/calendar.dal.ts src/data/booking/booking.dal.ts src/data/catalog/listing.dal.test.ts src/data/billing/billing.dal.test.ts src/app/api/cron/subscriptions/route.test.ts
git commit -m "fix(hardening): uniqueSlug retry-on-conflict + deterministic expireGracePeriods tests"
```

---

## Task 5: Export rate-limit + messaging UX

**Files:**
- Modify: `src/app/api/account/export/route.ts`
- Modify: `src/components/messaging/thread-list.tsx`, `chat-window.tsx`
- Modify: `messages/bg.json`, `messages/en.json` (ако липсва error низ)

**(a) export rate-limit (Medium).** `GET /api/account/export` — обгради `AccountDAL.exportData` с `checkRateLimit("account.export", u.id, <N>, <windowMs>)` (напр. 5/hr = `5, 3_600_000`) от `@/trpc/rate-limit`; при throw → `Response.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 })`.

**(b) ThreadList isError (Medium).** `thread-list.tsx:14-19` — добави `isError` в destructure; при грешка рендни error state (не празния «нямаш съобщения»), огледално на `chat-window.tsx:26,57-66`. Използвай съществуващ i18n error ключ или добави `Messages.loadError` (bg+en).

**(c) markRead re-fire (Low-Medium).** `chat-window.tsx:47-50` — префайрни `markRead.mutate({ threadId })` и при промяна на `thread?.messages.length` (не само на `threadId` mount), ползвайки същия trigger като autoscroll (`:53-55`). Guard срещу безсмислен mutate при 0 непрочетени (опционално — приемливо да префайрва).

- [ ] **Step 1:** Ако добавяш i18n ключ — добави го в двата файла. За (a): mock `@/trpc/rate-limit` няма нужда; тестът е опционален (route handler) — верифицирай чрез четене + tsc. За (b)/(c): UI — верифицирай чрез tsc + self-review (mirror съществуващ pattern).

- [ ] **Step 2: Имплементирай** (a)/(b)/(c).

- [ ] **Step 3: Verify** `pnpm exec tsc --noEmit` clean; `pnpm build` ok; i18n parity (bg==en key set).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/account/export/route.ts src/components/messaging/thread-list.tsx src/components/messaging/chat-window.tsx messages/bg.json messages/en.json
git commit -m "fix(hardening): rate-limit export route + ThreadList error state + live markRead"
```

---

## Task 6: Admin пагинация (unbounded scans)

**Files:**
- Modify: `src/data/admin/admin.dal.ts` (`listUsers`, `listListings`)
- Modify: admin router (`src/trpc/routers/admin.ts`) + admin UI страници (`src/app/[locale]/admin/*`)
- Test: `src/data/admin/*.dal.test.ts`

**(a) listUsers** (`admin.dal.ts:145-165`) — днес `SELECT * FROM user ORDER BY created_at DESC` без LIMIT. Добави `limit`/`offset` (или keyset) параметри; сортирането ползва `user_created_at_idx` (Task 1). Router процедурата приема `{ page/limit }`; UI добавя прости „напред/назад" контроли.

**(b) listListings({status:'published'})** (`admin.dal.ts:62-84`) — същият проблем за published queue. Добави същата пагинация. (`pending_approval` опашката е малка — но ползва същия път.)

- [ ] **Step 1: Failing test** — listUsers с `limit=1` връща 1 ред + коректен ред по created_at; извикване с offset пропуска.

- [ ] **Step 2: Run — fail.** `pnpm test -- admin`.

- [ ] **Step 3: Имплементирай** DAL пагинация + router input (zod `page`/`limit`, разумни default/max) + UI контроли (следвай съществуващ admin UI стил). Пази adminProcedure.

- [ ] **Step 4: Run tests + tsc + build** → PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/admin/admin.dal.ts src/trpc/routers/admin.ts src/app/[locale]/admin messages/bg.json messages/en.json src/data/admin
git commit -m "perf(hardening): paginate admin listUsers + listListings"
```

---

## Task 7: Accessibility touch-targets + aria-labels + i18n дребни

**Files:**
- Modify: `src/components/ui/dialog.tsx`, `sheet.tsx` (споделен close бутон)
- Modify: `src/components/admin/taxonomy-manager.tsx` (8 icon бутона), `src/components/vendor/wizard/{video-list,image-uploader}.tsx` (2 ✕), + `size="sm"` bump-ове в ~12 файла (виж research-quality §A1)
- Modify: `messages/bg.json`, `messages/en.json` (`Common.close`, aria низове, ICU plurals)

**(a) A3 — споделен Dialog/Sheet close** (`ui/dialog.tsx:70-82`, `sheet.tsx:~76`): bump close бутона от `icon-sm` (32px) на `size="icon"`/`size-11`; смени hardcoded `sr-only "Close"` на `t("close")` от `Common` (B3). Един fix → всички диалози/sheets.

**(b) A2 — 10 icon-only бутона без aria-label** (`taxonomy-manager.tsx:123,231,307,310,446,449,485,488` + `video-list.tsx:50`, `image-uploader.tsx:100`): добави `aria-label={t(...)}` (нови `Common`/`Admin` ключове, bg+en) + bump до `size="icon"`/`size-11`. Реален WCAG 4.1.2 fix.

**(c) A1 — `size="sm"` touch targets** (16 mobile-facing, research-quality §A1): bump на `size="default"` или `className="min-h-11"`. Пропусни 4-те `hidden md:inline-flex` desktop nav (header). Следвай съществуващия override pattern (`month-calendar.tsx:56-76`).

**(d) B4 — bg ICU plurals** (`bg.json:109-111` `imagesCount`/`videosCount`/`packagesCount`): конвертирай към `{count, plural, one {...} other {...}}` (bg: `one {# снимка} other {# снимки}` и т.н.); същото за en ключовете. (Low — но евтино в същия i18n pass.)

- [ ] **Step 1: i18n ключове** — добави `Common.close` + aria-label ключовете + ICU plural конверсиите в **двата** файла; провери parity.

- [ ] **Step 2: Имплементирай** (a)-(d). Без промяна на layout/логика — само размери/aria/plurals.

- [ ] **Step 3: Verify** `pnpm exec tsc --noEmit` clean; `pnpm build` ok; parity bg==en; self-review че всеки бивш `alt`-less/aria-less бутон вече има име.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/sheet.tsx src/components/admin/taxonomy-manager.tsx src/components/vendor/wizard/video-list.tsx src/components/vendor/wizard/image-uploader.tsx src/components/booking src/components/vendor/listing-actions.tsx src/components/messaging/inquiry-form.tsx src/components/layout/header.tsx src/app/[locale]/profil/dostavchik/obiavi/page.tsx messages/bg.json messages/en.json
git commit -m "fix(hardening): a11y touch targets + icon aria-labels + bg ICU plurals"
```

---

## Task 8: Review image alt text (public a11y) — ОПЦИОНАЛЕН/най-нисък приоритет

**Files:**
- Modify: `src/db/schema/reviews.ts` (+`alt` колона) → нова миграция `0008_*`
- Modify: `src/data/reviews/review.dto.ts` (ReviewImageDTO +alt), `review-media.dal.ts`, `src/components/reviews/review-form.tsx` (alt вход при upload), `reviews-section.tsx:45` (рендни `alt`)
- Modify: `messages/{bg,en}.json`

Единственият item с миграция + multi-file plumbing за Low-severity gap (`reviewImage` няма alt колона → публичните ревю снимки са `alt=""`). Включен за пълнота; **може да се отреже при одобрение** ако приоритетът е другаде.

- [ ] **Step 1:** `alt: text("alt")` (nullable) в `reviewImage`; `pnpm db:generate` → `0008_*` (additive); `pnpm db:migrate`.
- [ ] **Step 2:** Plumb `alt` през DTO + DAL; добави опционален alt вход в review-form upload; рендни `alt={img.alt ?? t("reviewImageFallbackAlt", { author })}` в `reviews-section.tsx:45`. i18n ключ в двата файла.
- [ ] **Step 3:** tsc + build + parity. Commit `feat(hardening): review image alt text for accessibility`.

---

## Self-Review

- **Покритие:** всички OPEN items от research-correctness (1-5,7,8), research-performance (индекси, пагинация, query rewrites, aggregate), research-quality (A1-A3 a11y, B2-B4 i18n, C2-C3 test-flake+uniqueSlug) са адресирани или изрично отложени.
- **Не-регресия:** промените са адитивни (индекси), error-code смени (FORBIDDEN→NOT_FOUND — callers третират еднакво), или UI размери — нисък регресионен риск. Всяка логическа промяна има тест.
- **Изрично отложено (документирано в Global Constraints):** CF orphans; rate-limit-before-zod; cat×city composite index; flat cache tag granularity.
- **Type consistency:** `pgCode` извлечен в `src/data/pg.ts` (Task 4) — Task 2 може да го ползва; ако Task 2 върви преди Task 4, дублирането остава до Task 4 (приемливо).

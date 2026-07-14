// Демо данни за тестване на M3.1 (резервации) + M3.2 (ревюта) върху една обява.
// Употреба: npx tsx scripts/seed-booking-demo.ts [listing-slug]
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, inArray } from "drizzle-orm";
import ws from "ws";
import { user } from "../src/db/schema/auth";
import { listing } from "../src/db/schema/catalog";
import { availabilityRule, booking, bookingServiceType } from "../src/db/schema/booking";
import { review } from "../src/db/schema/reviews";

neonConfig.webSocketConstructor = ws;
const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

const SLUG = process.argv[2] ?? "svatben-fotograf-emotsiya-i-stil-0";

const DEMO_CUSTOMERS = [
  { email: "demo-customer-1@event-review.seed", name: "Мария Иванова" },
  { email: "demo-customer-2@event-review.seed", name: "Георги Петров" },
  { email: "demo-customer-3@event-review.seed", name: "Елена Димитрова" },
];

const SERVICE_TYPES = [
  { kind: "full_day" as const, name: "Целодневно сватбено заснемане", durationMinutes: null, priceFromCents: 120000 },
  { kind: "hourly" as const, name: "Фотосесия (1 час)", durationMinutes: 60, priceFromCents: 15000 },
  { kind: "hourly" as const, name: "Репортажно заснемане (2 часа)", durationMinutes: 120, priceFromCents: 25000 },
];

// [quality, communication, professionalism, value, flexibility]
const REVIEWS = [
  {
    ratings: [5, 5, 5, 4, 5], title: "Невероятни кадри от сватбата ни",
    body: "Работихме с екипа за сватбата ни през май — снимките надминаха очакванията ни. Уловиха всички емоции, без да се натрапват. Горещо препоръчвам!",
    wouldRecommend: true, eventDate: "2026-05-16",
  },
  {
    ratings: [5, 4, 5, 5, 4], title: "Професионализъм от начало до край",
    body: "Точни, организирани и с око за детайла. Получихме галерията по-рано от обещаното. Единствено комуникацията преди събитието можеше да е малко по-бърза.",
    wouldRecommend: true, eventDate: "2026-06-01",
  },
  {
    ratings: [4, 5, 4, 4, 5], title: "Страхотна фотосесия, гъвкав екип",
    body: "Смениха ни локацията в последния момент заради дъжд и пак се справиха отлично. Цената е адекватна за качеството.",
    wouldRecommend: true, eventDate: "2026-06-20",
  },
];

async function main() {
  const [l] = await db.select({ id: listing.id }).from(listing).where(eq(listing.slug, SLUG));
  if (!l) throw new Error(`Няма обява със slug "${SLUG}"`);

  // идемпотентно чистене на предишния demo сет
  const emails = DEMO_CUSTOMERS.map((c) => c.email);
  const existing = await db.select({ id: user.id }).from(user).where(inArray(user.email, emails));
  if (existing.length > 0) {
    const ids = existing.map((u) => u.id);
    await db.delete(review).where(inArray(review.authorId, ids));
    await db.delete(booking).where(inArray(booking.customerId, ids));
    await db.delete(user).where(inArray(user.id, ids));
  }
  await db.delete(bookingServiceType).where(eq(bookingServiceType.listingId, l.id));
  await db.delete(availabilityRule).where(eq(availabilityRule.listingId, l.id));

  // 1. видове услуги
  const types = await db.insert(bookingServiceType)
    .values(SERVICE_TYPES.map((s) => ({ ...s, listingId: l.id })))
    .returning({ id: bookingServiceType.id, kind: bookingServiceType.kind });
  const fullDay = types.find((t) => t.kind === "full_day")!;

  // 2. работно време — всеки ден 09:00–18:00 (weekday: 0=пн … 6=нд)
  await db.insert(availabilityRule).values(
    Array.from({ length: 7 }, (_, weekday) => ({
      listingId: l.id, weekday, startTime: "09:00", endTime: "18:00",
    })),
  );

  // 3. demo клиенти
  const customers = DEMO_CUSTOMERS.map((c) => ({ ...c, id: randomUUID() }));
  await db.insert(user).values(customers.map((c) => ({
    id: c.id, email: c.email, name: c.name, emailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
  })));

  // 4. приключени резервации (в миналото) + ревюта към тях
  for (let i = 0; i < REVIEWS.length; i++) {
    const r = REVIEWS[i]!;
    const customer = customers[i]!;
    const [b] = await db.insert(booking).values({
      listingId: l.id, serviceTypeId: fullDay.id, customerId: customer.id,
      status: "completed", isFullDay: true, eventDate: r.eventDate,
      phone: `+35988800000${i + 1}`, message: "Демо резервация (seed)",
      confirmedAt: new Date(r.eventDate),
    }).returning({ id: booking.id });

    const sum = r.ratings.reduce((a, b) => a + b, 0);
    const createdAt = new Date(new Date(r.eventDate).getTime() + 3 * 24 * 3600 * 1000);
    await db.insert(review).values({
      bookingId: b!.id, listingId: l.id, authorId: customer.id,
      ratingQuality: r.ratings[0]!, ratingCommunication: r.ratings[1]!,
      ratingProfessionalism: r.ratings[2]!, ratingValue: r.ratings[3]!,
      ratingFlexibility: r.ratings[4]!, ratingOverall: (sum / 5).toFixed(2),
      title: r.title, body: r.body, wouldRecommend: r.wouldRecommend,
      eventDate: r.eventDate, createdAt,
      editableUntil: new Date(createdAt.getTime() + 48 * 3600 * 1000),
    });
  }

  // 5. преизчисляване на денормализирания рейтинг (като recomputeListingRating)
  const visible = await db.select({ o: review.ratingOverall }).from(review)
    .where(and(eq(review.listingId, l.id), eq(review.status, "visible")));
  const avg = visible.reduce((a, r) => a + Number(r.o), 0) / visible.length;
  await db.update(listing)
    .set({ ratingAvg: avg.toFixed(2), reviewCount: visible.length })
    .where(eq(listing.id, l.id));

  console.log(`OK: ${types.length} вида услуги, 7 дни работно време, ${REVIEWS.length} резервации+ревюта → ${SLUG} (avg ${avg.toFixed(2)})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

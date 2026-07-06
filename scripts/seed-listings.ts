import "dotenv/config";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, inArray } from "drizzle-orm";
import ws from "ws";
import {
  user,
} from "../src/db/schema/auth";
import {
  category, city, listing, listingAttribute, listingImage, listingVideo,
  servicePackage, attributeDefinition,
} from "../src/db/schema/catalog";
import { slugifyBg } from "../src/lib/slug";

neonConfig.webSocketConstructor = ws;
const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

const DEMO_OWNERS = [
  { id: "demo-owner-1", email: "demo-owner-1@event-review.seed", name: "Демо Студио" },
  { id: "demo-owner-2", email: "demo-owner-2@event-review.seed", name: "Демо Агенция" },
];

// реалистични BG заглавия по категориен slug
const TITLES: Record<string, string[]> = {
  fotografi: ["Сватбен фотограф — емоция и стил", "Фото студио Пловдив", "Артистична сватбена фотография"],
  videografi: ["Кинематографично сватбено видео", "Дрон заснемане за събития", "Full HD видеозаснемане"],
  dj: ["DJ за сватби и партита", "Диджей с озвучаване и осветление", "Парти DJ — всички жанрове"],
  vodeshti: ["Водещ и тамада за сватба", "Модератор на корпоративни събития", "Артистичен водещ"],
  restoranti: ["Ресторант за сватбени тържества", "Банкетна зала до 200 гости", "Градински ресторант"],
  hoteli: ["Хотел за сватбени пакети", "СПА хотел за събития", "Бутиков хотел с зала"],
  "svatbeni-zali": ["Бална зала за 300 гости", "Панорамна зала за сватби", "Зала с градина"],
  dekoratori: ["Декорация на зали и маси", "Флорална декорация", "Тематична декорация"],
  floristi: ["Букети и цветни аранжименти", "Флорист за сватби", "Сезонни композиции"],
  sladkarnitsi: ["Сватбени торти по поръчка", "Свежи десерти за събития", "Кенди бар"],
  grimyori: ["Сватбен грим и прическа", "Професионален грим", "Грим за фотосесии"],
  frizyori: ["Сватбени прически", "Стилист за булки", "Прически за събития"],
  transport: ["Ретро автомобил за сватба", "Лимузина под наем", "Транспорт за гости"],
};

const DESCRIPTIONS = [
  "Професионален екип с дългогодишен опит. Индивидуален подход към всяко събитие.",
  "Работим в цялата страна. Пакетни цени и безплатна консултация.",
  "Портфолио с над 200 събития. Гъвкави условия и бърза комуникация.",
];

const CF_IDS = ["demo-cf-1", "demo-cf-2", "demo-cf-3", "demo-cf-4"]; // placeholder — UI fallback хваща 404
const YT_IDS = ["dQw4w9WgXcQ", "9bZkp7q19f0"];

async function main() {
  // 1. идемпотентно триене на предишния demo сет
  const emails = DEMO_OWNERS.map((o) => o.email);
  const existing = await db.select({ id: user.id }).from(user).where(inArray(user.email, emails));
  for (const u of existing) {
    await db.delete(listing).where(eq(listing.ownerId, u.id)); // каскади чистят децата
  }
  await db.delete(user).where(inArray(user.email, emails));

  // 2. demo owner-и
  const owners = DEMO_OWNERS.map((o) => ({ ...o, id: randomUUID() }));
  await db.insert(user).values(owners.map((o) => ({
    id: o.id, email: o.email, name: o.name, emailVerified: true,
    createdAt: new Date(), updatedAt: new Date(),
  })));

  // 3. таксономия справочници
  const cats = await db.select({ id: category.id, slug: category.slug }).from(category);
  const cities = await db.select({ id: city.id, slug: city.slug }).from(city);
  const defs = await db
    .select({ id: attributeDefinition.id, categoryId: attributeDefinition.categoryId,
      key: attributeDefinition.key, type: attributeDefinition.type, options: attributeDefinition.options,
      showAsFilter: attributeDefinition.showAsFilter })
    .from(attributeDefinition);
  const defsByCat = new Map<string, typeof defs>();
  for (const d of defs) {
    (defsByCat.get(d.categoryId) ?? defsByCat.set(d.categoryId, []).get(d.categoryId)!).push(d);
  }

  // 4. генерирай ~40 обяви
  const now = Date.now();
  let created = 0;
  let dayOffset = 0;
  for (const cat of cats) {
    const titles = TITLES[cat.slug];
    if (!titles) continue; // категории без demo заглавия се пропускат
    for (let i = 0; i < titles.length; i++) {
      const owner = owners[created % owners.length]!;
      const targetCity = cities[created % cities.length]!;
      const title = titles[i]!;
      const publishedAt = new Date(now - dayOffset * 24 * 3600 * 1000);
      dayOffset += 3;
      const slug = `${slugifyBg(title)}-${created}`;
      const priceFrom = 15000 + (created % 8) * 10000;

      const [row] = await db.insert(listing).values({
        ownerId: owner.id, categoryId: cat.id, cityId: targetCity.id,
        slug, title, description: DESCRIPTIONS[created % DESCRIPTIONS.length]!,
        wholeCountry: created % 4 === 0, status: "published",
        priceFromCents: priceFrom, publishedAt,
        ratingAvg: null, reviewCount: 0, // Ф3 ревюта — без rating badge на seed
        updatedAt: publishedAt,
      }).returning({ id: listing.id });
      const listingId = row!.id;

      // пакети (2) — priceFromCents на обявата отговаря на най-евтиния
      await db.insert(servicePackage).values([
        { listingId, name: "Базов пакет", priceFromCents: priceFrom, duration: "6 часа", included: "Основна услуга", sortOrder: 0 },
        { listingId, name: "Премиум пакет", priceFromCents: priceFrom + 20000, duration: "цял ден", included: "Разширен пакет + допълнения", sortOrder: 1 },
      ]);

      // изображения (2 placeholder)
      await db.insert(listingImage).values([
        { listingId, cfImageId: CF_IDS[created % CF_IDS.length]!, sortOrder: 0 },
        { listingId, cfImageId: CF_IDS[(created + 1) % CF_IDS.length]!, sortOrder: 1 },
      ]);

      // видео на всяка трета
      if (created % 3 === 0) {
        await db.insert(listingVideo).values({ listingId, youtubeId: YT_IDS[created % YT_IDS.length]!, sortOrder: 0 });
      }

      // атрибутни стойности за filter-ируемите дефиниции на категорията
      const catDefs = defsByCat.get(cat.id) ?? [];
      const attrRows = catDefs
        .filter((d) => d.showAsFilter && (d.type === "single" || d.type === "multi"))
        .slice(0, 2)
        .map((d) => {
          const opts = (d.options as { value: string }[] | null) ?? [];
          if (opts.length === 0) return null;
          const value = d.type === "multi" ? [opts[0]!.value] : opts[0]!.value;
          return { listingId, attributeDefinitionId: d.id, value };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (attrRows.length > 0) await db.insert(listingAttribute).values(attrRows);

      created++;
    }
  }

  console.log(`seed-listings done: ${created} published listings across ${owners.length} demo owners`);
  process.exit(0);
}

main();

import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import ws from "ws";
import { category, region, city, attributeDefinition } from "../src/db/schema/catalog";
import { setting } from "../src/db/schema/billing";
import { CATEGORIES, REGIONS } from "./seed-data";
import { ATTRIBUTE_SEED } from "./seed-attributes";

neonConfig.webSocketConstructor = ws;
const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

async function seedAttributes() {
  const cats = await db.select({ id: category.id, slug: category.slug }).from(category);
  const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
  for (const [slug, defs] of Object.entries(ATTRIBUTE_SEED)) {
    const categoryId = bySlug.get(slug);
    if (!categoryId) throw new Error(`категория липсва: ${slug}`);
    await db
      .insert(attributeDefinition)
      .values(defs.map((d, i) => ({
        categoryId, key: d.key, labelBg: d.labelBg, labelEn: d.labelEn,
        type: d.type, options: d.options ?? null,
        showAsFilter: d.showAsFilter, showAsChip: d.showAsChip, sortOrder: i,
      })))
      .onConflictDoNothing();
  }
}

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

  await db
    .insert(setting)
    .values([
      { key: "billing.limits", value: { standard: 1, premiumPerCategory: 2 } },
      { key: "billing.graceDays", value: 7 },
    ])
    .onConflictDoNothing({ target: setting.key });

  await seedAttributes();

  console.log("seed done");
  process.exit(0);
}

main();

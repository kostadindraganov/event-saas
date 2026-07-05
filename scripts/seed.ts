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

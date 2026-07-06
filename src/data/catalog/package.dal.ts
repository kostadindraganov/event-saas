import "server-only";
import { asc, eq, min } from "drizzle-orm";
import { db } from "@/db";
import { listing, listingVideo, servicePackage } from "@/db/schema";
import { parseYouTubeId } from "@/lib/youtube";
import type { SessionUser } from "@/data/users/require-user";
import { canEditListing } from "./catalog.policy";
import type { PackageDTO, PackageInput } from "./catalog.dto";

async function assertOwned(user: SessionUser, listingId: string) {
  const [row] = await db.select().from(listing).where(eq(listing.id, listingId));
  if (!row) throw new Error("NOT_FOUND");
  if (!canEditListing(user, row)) throw new Error("FORBIDDEN");
  return row;
}

async function recalcPriceFrom(listingId: string) {
  const [agg] = await db
    .select({ minPrice: min(servicePackage.priceFromCents) })
    .from(servicePackage)
    .where(eq(servicePackage.listingId, listingId));
  await db
    .update(listing)
    .set({ priceFromCents: agg?.minPrice ?? null, updatedAt: new Date() })
    .where(eq(listing.id, listingId));
}

function toPackageDTO(r: typeof servicePackage.$inferSelect): PackageDTO {
  return { id: r.id, listingId: r.listingId, name: r.name, priceFromCents: r.priceFromCents,
    duration: r.duration, included: r.included, sortOrder: r.sortOrder };
}

export class PackageDAL {
  private constructor(private readonly user: SessionUser) {}
  static for(user: SessionUser) { return new PackageDAL(user); }

  async create(input: PackageInput): Promise<PackageDTO> {
    await assertOwned(this.user, input.listingId);
    const [row] = await db.insert(servicePackage).values(input).returning();
    if (!row) throw new Error("INSERT_FAILED");
    await recalcPriceFrom(input.listingId);
    return toPackageDTO(row);
  }

  async update(input: { id: string } & Partial<Omit<PackageInput, "listingId">>): Promise<PackageDTO> {
    const [existing] = await db.select().from(servicePackage).where(eq(servicePackage.id, input.id));
    if (!existing) throw new Error("NOT_FOUND");
    await assertOwned(this.user, existing.listingId);
    const { id, ...fields } = input;
    const [row] = await db.update(servicePackage).set(fields).where(eq(servicePackage.id, id)).returning();
    if (!row) throw new Error("NOT_FOUND");
    await recalcPriceFrom(existing.listingId);
    return toPackageDTO(row);
  }

  async remove(id: string): Promise<void> {
    const [existing] = await db.select().from(servicePackage).where(eq(servicePackage.id, id));
    if (!existing) throw new Error("NOT_FOUND");
    await assertOwned(this.user, existing.listingId);
    await db.delete(servicePackage).where(eq(servicePackage.id, id));
    await recalcPriceFrom(existing.listingId);
  }

  async listByListing(listingId: string): Promise<PackageDTO[]> {
    await assertOwned(this.user, listingId);
    const rows = await db
      .select().from(servicePackage)
      .where(eq(servicePackage.listingId, listingId))
      .orderBy(asc(servicePackage.sortOrder), asc(servicePackage.name));
    return rows.map(toPackageDTO);
  }
}

export class VideoDAL {
  private constructor(private readonly user: SessionUser) {}
  static for(user: SessionUser) { return new VideoDAL(user); }

  async add(listingId: string, url: string) {
    await assertOwned(this.user, listingId);
    const youtubeId = parseYouTubeId(url);
    if (!youtubeId) throw new Error("INVALID_YOUTUBE_URL");
    const existing = await this.listByListing(listingId);
    if (existing.length >= 10) throw new Error("VIDEO_LIMIT");
    const [row] = await db.insert(listingVideo).values({ listingId, youtubeId, sortOrder: existing.length }).returning();
    return row!;
  }

  async remove(id: string): Promise<void> {
    const [existing] = await db.select().from(listingVideo).where(eq(listingVideo.id, id));
    if (!existing) throw new Error("NOT_FOUND");
    await assertOwned(this.user, existing.listingId);
    await db.delete(listingVideo).where(eq(listingVideo.id, id));
  }

  async listByListing(listingId: string) {
    await assertOwned(this.user, listingId);
    return db.select().from(listingVideo).where(eq(listingVideo.listingId, listingId)).orderBy(asc(listingVideo.sortOrder));
  }
}

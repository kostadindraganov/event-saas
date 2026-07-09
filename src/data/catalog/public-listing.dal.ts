import "server-only";
import { and, asc, count, desc, eq, gt, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  attributeDefinition, category, city, listing, listingAttribute,
  listingImage, listingServiceRegion, listingVideo, promotion, region, servicePackage, user,
} from "@/db/schema";
import { CalendarDAL } from "@/data/booking/calendar.dal";
import { ReviewDAL } from "@/data/reviews/review.dal";
import type {
  PublicListingCardDTO, PublicListingCityCount, PublicListingDetailDTO, PublicListingFilterInput,
  PublicListingPage, PublicPackageDTO,
} from "./public.dto";

// една активна промоция per обява е app-level инвариант (activate + projectOrderEvent guard,
// виж billing.dal.ts) → този LEFT JOIN връща максимум 1 ред на listing, без fanout риск.
// export: ВСЕКИ консуматор на cardColumns трябва да join-не promotion с това условие (напр. SavedDAL).
export function activePromotionJoin(): SQL {
  return and(
    eq(promotion.listingId, listing.id),
    lte(promotion.startsAt, sql`now()`),
    gt(promotion.endsAt, sql`now()`),
  )!;
}

export const cardColumns = {
  id: listing.id,
  slug: listing.slug,
  title: listing.title,
  categorySlug: category.slug,
  categoryNameBg: category.nameBg,
  categoryNameEn: category.nameEn,
  cityName: city.name,
  wholeCountry: listing.wholeCountry,
  priceFromCents: listing.priceFromCents,
  ratingAvg: listing.ratingAvg,
  reviewCount: listing.reviewCount,
  coverCfImageId: listingImage.cfImageId,
  publishedAt: listing.publishedAt,
  promotedStartsAt: promotion.startsAt, // non-null ⇒ promoted; стойността е и tie-breaker-ът
};

type CardRow = {
  id: string; slug: string; title: string;
  categorySlug: string; categoryNameBg: string; categoryNameEn: string;
  cityName: string | null; wholeCountry: boolean;
  priceFromCents: number | null; ratingAvg: string | null; reviewCount: number;
  coverCfImageId: string | null; publishedAt: Date | null;
  promotedStartsAt: Date | null;
};

export function toCard(r: CardRow): PublicListingCardDTO {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    categorySlug: r.categorySlug,
    categoryNameBg: r.categoryNameBg,
    categoryNameEn: r.categoryNameEn,
    cityName: r.cityName,
    wholeCountry: r.wholeCountry,
    priceFromCents: r.priceFromCents,
    ratingAvg: r.ratingAvg === null ? null : Number(r.ratingAvg),
    reviewCount: r.reviewCount,
    coverCfImageId: r.coverCfImageId,
    publishedAt: r.publishedAt!.toISOString(), // status='published' ⇒ винаги сетнат
    promoted: r.promotedStartsAt !== null,
  };
}

type AttrOption = { value: string; labelBg: string; labelEn: string };

// jsonb value (single string / multi array / boolean / number) → локализирани стойности
function resolveChipValues(
  type: string,
  options: AttrOption[] | null,
  value: unknown,
): { valuesBg: string[]; valuesEn: string[] } {
  const raw = Array.isArray(value) ? value : [value];
  if (type === "boolean") {
    const b = value === true;
    return { valuesBg: [b ? "Да" : "Не"], valuesEn: [b ? "Yes" : "No"] };
  }
  if (type === "number") {
    return { valuesBg: raw.map(String), valuesEn: raw.map(String) };
  }
  const byValue = new Map((options ?? []).map((o) => [o.value, o]));
  const valuesBg: string[] = [];
  const valuesEn: string[] = [];
  for (const v of raw) {
    const opt = byValue.get(v as string);
    valuesBg.push(opt?.labelBg ?? String(v));
    valuesEn.push(opt?.labelEn ?? String(v));
  }
  return { valuesBg, valuesEn };
}

// Споделен conds-builder за публичните листинг заявки. Съзнателно НЕ включва cityId —
// list() го добавя при филтър по град, countByCity() го пропуска (пиновете покриват всички градове).
function baseConds(input: PublicListingFilterInput): SQL[] {
  const conds: SQL[] = [
    eq(listing.status, "published"),
    eq(listing.categoryId, input.categoryId),
  ];
  if (input.regionId) {
    conds.push(sql`(${listing.wholeCountry} = true or exists (
      select 1 from ${listingServiceRegion} lsr
      where lsr.listing_id = ${listing.id} and lsr.region_id = ${input.regionId}
    ))`);
  }
  if (input.priceMinCents !== undefined) conds.push(gte(listing.priceFromCents, input.priceMinCents));
  if (input.priceMaxCents !== undefined) conds.push(lte(listing.priceFromCents, input.priceMaxCents));
  for (const attr of input.attrs ?? []) {
    if (attr.values.length === 0) continue;
    const vals = sql.join(attr.values.map((v) => sql`${v}`), sql`, `);
    conds.push(sql`exists (
      select 1 from ${listingAttribute} la
      where la.listing_id = ${listing.id}
        and la.attribute_definition_id = ${attr.definitionId}
        and la.value ?| array[${vals}]
    )`);
  }
  return conds;
}

export class PublicListingDAL {
  async getBySlug(slug: string): Promise<PublicListingDetailDTO | null> {
    const [row] = await db
      .select({ ...cardColumns, description: listing.description, vendorAvgResponseMinutes: user.avgResponseMinutes })
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .innerJoin(user, eq(listing.ownerId, user.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .leftJoin(promotion, activePromotionJoin())
      .where(and(eq(listing.slug, slug), eq(listing.status, "published")));
    if (!row) return null;

    const id = row.id;
    const [regions, images, videos, packages, attrs, serviceTypes, reviews] = await Promise.all([
      db.select({ name: region.name })
        .from(listingServiceRegion)
        .innerJoin(region, eq(listingServiceRegion.regionId, region.id))
        .where(eq(listingServiceRegion.listingId, id))
        .orderBy(asc(region.name)),
      db.select({ cfImageId: listingImage.cfImageId, sortOrder: listingImage.sortOrder })
        .from(listingImage)
        .where(eq(listingImage.listingId, id))
        .orderBy(asc(listingImage.sortOrder)),
      db.select({ youtubeId: listingVideo.youtubeId })
        .from(listingVideo)
        .where(eq(listingVideo.listingId, id))
        .orderBy(asc(listingVideo.sortOrder)),
      db.select({
        id: servicePackage.id, name: servicePackage.name,
        priceFromCents: servicePackage.priceFromCents,
        duration: servicePackage.duration, included: servicePackage.included,
      })
        .from(servicePackage)
        .where(eq(servicePackage.listingId, id))
        .orderBy(asc(servicePackage.sortOrder), asc(servicePackage.name)),
      db.select({
        key: attributeDefinition.key, labelBg: attributeDefinition.labelBg,
        labelEn: attributeDefinition.labelEn, type: attributeDefinition.type,
        options: attributeDefinition.options, value: listingAttribute.value,
      })
        .from(listingAttribute)
        .innerJoin(attributeDefinition, eq(listingAttribute.attributeDefinitionId, attributeDefinition.id))
        .where(and(eq(listingAttribute.listingId, id), eq(attributeDefinition.showAsChip, true)))
        .orderBy(asc(attributeDefinition.sortOrder)),
      CalendarDAL.public().listActiveServiceTypes(id),
      ReviewDAL.public().listByListing(id),
    ]);

    const packageDTOs: PublicPackageDTO[] = packages.map((p) => ({
      id: p.id, name: p.name, priceCents: p.priceFromCents,
      duration: p.duration, included: p.included,
    }));

    const chips = attrs.map((a) => {
      const { valuesBg, valuesEn } = resolveChipValues(a.type, a.options as AttrOption[] | null, a.value);
      return { definitionKey: a.key, labelBg: a.labelBg, labelEn: a.labelEn, valuesBg, valuesEn };
    });

    return {
      ...toCard(row),
      description: row.description,
      serviceRegionNames: regions.map((r) => r.name),
      images: images.map((i) => ({ cfImageId: i.cfImageId, sortOrder: i.sortOrder })),
      videos: videos.map((v) => ({ youtubeVideoId: v.youtubeId })),
      packages: packageDTOs,
      chips,
      vendorAvgResponseMinutes: row.vendorAvgResponseMinutes,
      serviceTypes,
      reviews,
    };
  }

  async list(input: PublicListingFilterInput): Promise<PublicListingPage> {
    const perPage = Math.min(Math.max(input.perPage, 1), 50);
    const page = Math.max(input.page, 1);
    const offset = (page - 1) * perPage;

    const conds = baseConds(input);
    if (input.cityId) conds.push(eq(listing.cityId, input.cityId));
    const where = and(...conds);

    const orderBy =
      input.sort === "priceAsc" ? [asc(listing.priceFromCents)]
      : input.sort === "priceDesc" ? [desc(listing.priceFromCents)]
      // default («препоръчани» = new): promoted-first, tie-break по startsAt DESC, после publishedAt DESC.
      // promotedStartsAt е булев-подобен (null/non-null) — `is not null` е винаги true/false, никога null,
      // затова първият ключ group-ва чисто без NULLS FIRST/LAST изненади от plain desc(timestamp).
      : [desc(sql`${promotion.startsAt} is not null`), desc(promotion.startsAt), desc(listing.publishedAt)];

    const rows = await db
      .select(cardColumns)
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .leftJoin(promotion, activePromotionJoin())
      .where(where)
      .orderBy(...orderBy)
      .limit(perPage)
      .offset(offset);

    const [row] = await db.select({ total: count() }).from(listing).where(where);

    return { items: rows.map(toCard), total: row?.total ?? 0, page, perPage };
  }

  async countByCity(input: PublicListingFilterInput): Promise<PublicListingCityCount[]> {
    const conds = baseConds(input);
    // wholeCountry обявите нямат позиция на картата (виж CONTEXT.md «Гео-локация (град)»)
    conds.push(eq(listing.wholeCountry, false));
    const rows = await db
      .select({ cityId: listing.cityId, slug: city.slug, name: city.name, cnt: count() })
      .from(listing)
      .innerJoin(city, eq(listing.cityId, city.id))
      .where(and(...conds))
      .groupBy(listing.cityId, city.slug, city.name);
    return rows.map((r) => ({ cityId: r.cityId, slug: r.slug, name: r.name, count: r.cnt }));
  }

  async search(q: string, page: number, perPage: number): Promise<PublicListingPage> {
    const trimmed = q.trim();
    const pp = Math.min(Math.max(perPage, 1), 50);
    const pg = Math.max(page, 1);
    if (!trimmed) return { items: [], total: 0, page: pg, perPage: pp };

    // websearch_to_tsquery: безопасно за произволен вход, без синтактични грешки
    const tsq = sql`websearch_to_tsquery('simple', ${trimmed})`;
    const where = and(eq(listing.status, "published"), sql`${listing.searchTsv} @@ ${tsq}`);

    const rows = await db
      .select(cardColumns)
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .leftJoin(promotion, activePromotionJoin())
      .where(where)
      .orderBy(desc(listing.publishedAt))
      .limit(pp)
      .offset((pg - 1) * pp);

    const [row] = await db.select({ total: count() }).from(listing).where(where);
    return { items: rows.map(toCard), total: row?.total ?? 0, page: pg, perPage: pp };
  }

  async recent(limit: number): Promise<PublicListingCardDTO[]> {
    const rows = await db
      .select(cardColumns)
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .leftJoin(promotion, activePromotionJoin())
      .where(eq(listing.status, "published"))
      .orderBy(desc(listing.publishedAt))
      .limit(Math.min(Math.max(limit, 1), 50));
    return rows.map(toCard);
  }

  // карусел «Промотирани» на началната — само активно промотирани published обяви
  async promoted(limit: number): Promise<PublicListingCardDTO[]> {
    const rows = await db
      .select(cardColumns)
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .innerJoin(promotion, activePromotionJoin())
      .where(eq(listing.status, "published"))
      .orderBy(desc(promotion.startsAt))
      .limit(Math.min(Math.max(limit, 1), 50));
    return rows.map(toCard);
  }

  async sitemapEntries(offset: number, limit: number): Promise<{ slug: string; publishedAt: string }[]> {
    const rows = await db
      .select({ slug: listing.slug, publishedAt: listing.publishedAt })
      .from(listing)
      .where(eq(listing.status, "published"))
      .orderBy(desc(listing.publishedAt))
      .limit(Math.min(Math.max(limit, 1), 50_000))
      .offset(Math.max(offset, 0));
    return rows.map((r) => ({ slug: r.slug, publishedAt: r.publishedAt!.toISOString() }));
  }

  async publishedCount(): Promise<number> {
    const [row] = await db.select({ total: count() }).from(listing).where(eq(listing.status, "published"));
    return row?.total ?? 0;
  }
}

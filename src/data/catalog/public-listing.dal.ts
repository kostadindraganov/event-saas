import "server-only";
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  attributeDefinition, category, city, listing, listingAttribute,
  listingImage, listingServiceRegion, listingVideo, region, servicePackage,
} from "@/db/schema";
import type {
  PublicListingCardDTO, PublicListingDetailDTO, PublicListingFilterInput,
  PublicListingPage, PublicPackageDTO,
} from "./public.dto";

const cardColumns = {
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
};

type CardRow = {
  id: string; slug: string; title: string;
  categorySlug: string; categoryNameBg: string; categoryNameEn: string;
  cityName: string | null; wholeCountry: boolean;
  priceFromCents: number | null; ratingAvg: string | null; reviewCount: number;
  coverCfImageId: string | null; publishedAt: Date | null;
};

function toCard(r: CardRow): PublicListingCardDTO {
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

export class PublicListingDAL {
  async getBySlug(slug: string): Promise<PublicListingDetailDTO | null> {
    const [row] = await db
      .select({ ...cardColumns, description: listing.description })
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .where(and(eq(listing.slug, slug), eq(listing.status, "published")));
    if (!row) return null;

    const id = row.id;
    const [regions, images, videos, packages, attrs] = await Promise.all([
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
    };
  }

  async list(input: PublicListingFilterInput): Promise<PublicListingPage> {
    const perPage = Math.min(Math.max(input.perPage, 1), 50);
    const page = Math.max(input.page, 1);
    const offset = (page - 1) * perPage;

    const conds: SQL[] = [
      eq(listing.status, "published"),
      eq(listing.categoryId, input.categoryId),
    ];
    if (input.cityId) conds.push(eq(listing.cityId, input.cityId));
    if (input.regionId) {
      // регион: обслужва конкретния регион ИЛИ покрива цялата страна
      conds.push(sql`(${listing.wholeCountry} = true or exists (
        select 1 from ${listingServiceRegion} lsr
        where lsr.listing_id = ${listing.id} and lsr.region_id = ${input.regionId}
      ))`);
    }
    if (input.priceMinCents !== undefined) conds.push(gte(listing.priceFromCents, input.priceMinCents));
    if (input.priceMaxCents !== undefined) conds.push(lte(listing.priceFromCents, input.priceMaxCents));
    for (const attr of input.attrs ?? []) {
      if (attr.values.length === 0) continue;
      // jsonb `?|` съвпада и за скаларен string, и за масив (single/multi)
      const vals = sql.join(attr.values.map((v) => sql`${v}`), sql`, `);
      conds.push(sql`exists (
        select 1 from ${listingAttribute} la
        where la.listing_id = ${listing.id}
          and la.attribute_definition_id = ${attr.definitionId}
          and la.value ?| array[${vals}]
      )`);
    }
    const where = and(...conds);

    const orderBy =
      input.sort === "priceAsc" ? [asc(listing.priceFromCents)]
      : input.sort === "priceDesc" ? [desc(listing.priceFromCents)]
      : [desc(listing.publishedAt)];

    const rows = await db
      .select(cardColumns)
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .leftJoin(listingImage, eq(listing.coverImageId, listingImage.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(perPage)
      .offset(offset);

    const [row] = await db.select({ total: count() }).from(listing).where(where);

    return { items: rows.map(toCard), total: row?.total ?? 0, page, perPage };
  }
}

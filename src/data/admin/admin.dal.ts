import "server-only";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/db";
import {
  attributeDefinition, category, city, listing, listingAttribute, listingServiceRegion,
  promotion, question, region, report, review, session, setting, subscription, user,
} from "@/db/schema";
import { AttributeDAL } from "@/data/catalog/attribute.dal";
import { BillingDAL, getBillingSettings, type BillingSettings } from "@/data/billing/billing.dal";
import { recomputeListingRating } from "@/data/reviews/aggregate";
import { listingApprovedEmail, listingRejectedEmail, sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/seo";
import type {
  AdminListingRowDTO,
  AdminUserDTO,
  AdminDashboardStatsDTO,
  BillingSettingsInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryRowDTO,
  AttributeDefinitionCreateInput,
  AttributeDefinitionUpdateInput,
  RegionCreateInput,
  RegionUpdateInput,
  RegionRowDTO,
  CityCreateInput,
  CityUpdateInput,
  CityRowDTO,
  ReportRowDTO,
  ReportResolveInput,
} from "./admin.dto";

// drizzle-orm/neon-serverless обвива pg грешката — реалният код е в err.cause.code
function pgCode(err: unknown): string | undefined {
  return (err as { code?: string; cause?: { code?: string } })?.cause?.code;
}

// fire-and-forget: чете email от user; огледален на billing.dal.ts:124-139 (never-throw в caller-а)
async function notifyListingApproved(userId: string, listingTitle: string, slug: string): Promise<void> {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!row?.email) return;
  const { subject, html } = listingApprovedEmail({ listingTitle, listingUrl: `${getBaseUrl()}/obiava/${slug}` });
  await sendEmail({ to: row.email, subject, html });
}

async function notifyListingRejected(userId: string, listingTitle: string, reason: string, listingId: string): Promise<void> {
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!row?.email) return;
  const { subject, html } = listingRejectedEmail({
    listingTitle,
    reason,
    editUrl: `${getBaseUrl()}/profil/dostavchik/obiavi/${listingId}`,
  });
  await sendEmail({ to: row.email, subject, html });
}

export class AdminDAL {
  // adminProcedure вече гарантира admin → чисти static методи, без for(user) фабрика.

  static async listListings({ status }: { status: "pending_approval" | "published" }): Promise<AdminListingRowDTO[]> {
    const rows = await db
      .select({
        id: listing.id,
        title: listing.title,
        status: listing.status,
        categoryNameBg: category.nameBg,
        categoryNameEn: category.nameEn,
        cityName: city.name,
        ownerName: user.name,
        ownerEmail: user.email,
        createdAt: listing.createdAt,
        rejectionReason: listing.rejectionReason,
      })
      .from(listing)
      .innerJoin(category, eq(listing.categoryId, category.id))
      .innerJoin(city, eq(listing.cityId, city.id))
      .innerJoin(user, eq(listing.ownerId, user.id))
      .where(eq(listing.status, status))
      .orderBy(desc(listing.createdAt));
    // status е стеснен от WHERE-а към param-а; overriding-ва широкия listing.status enum (noUncheckedIndexedAccess narrowing gap)
    return rows.map((r) => ({ ...r, status, createdAt: r.createdAt.toISOString() }));
  }

  // pending_approval → published. Entitlement е АВТОРИТЕТЕН тук (единственият преход, който
  // консумира лимита) — assertCanPublish ВЪТРЕ в tx, ПРЕДИ CAS. Провал → tx rollback, обявата
  // остава pending, грешката бълбука към админа (без auto-reject).
  static async approve(id: string): Promise<{ slug: string; status: string }> {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          ownerId: listing.ownerId,
          categoryId: listing.categoryId,
          status: listing.status,
        })
        .from(listing)
        .where(eq(listing.id, id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "pending_approval") throw new TRPCError({ code: "CONFLICT", message: "NOT_PENDING" });

      await BillingDAL.assertCanPublish(tx, row.ownerId, row.categoryId, id);

      const [updated] = await tx
        .update(listing)
        .set({
          status: "published",
          publishedAt: new Date(),
          rejectionReason: null,
          hiddenBySystem: false,
          updatedAt: new Date(),
        })
        .where(and(eq(listing.id, id), eq(listing.status, "pending_approval")))
        .returning({ ownerId: listing.ownerId, title: listing.title, slug: listing.slug, status: listing.status });
      if (!updated) throw new TRPCError({ code: "CONFLICT" }); // CAS изгубена — конкурентен преход
      return updated;
    });
    void notifyListingApproved(result.ownerId, result.title, result.slug).catch((e) => console.error("email failed", e));
    return { slug: result.slug, status: result.status };
  }

  // pending_approval → rejected + причина. Единичен CAS (WHERE status='pending_approval') — без tx.
  static async reject(id: string, reason: string): Promise<{ slug: string; status: string }> {
    const [updated] = await db
      .update(listing)
      .set({ status: "rejected", rejectionReason: reason, updatedAt: new Date() })
      .where(and(eq(listing.id, id), eq(listing.status, "pending_approval")))
      .returning({ ownerId: listing.ownerId, title: listing.title, slug: listing.slug, status: listing.status });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    void notifyListingRejected(updated.ownerId, updated.title, reason, id).catch((e) => console.error("email failed", e));
    return { slug: updated.slug, status: updated.status };
  }

  // Admin takedown: published|hidden → removed. БЕЗ owner филтър (админ действа върху чужди обяви).
  static async remove(id: string): Promise<{ slug: string; status: string }> {
    const [updated] = await db
      .update(listing)
      .set({ status: "removed", updatedAt: new Date() })
      .where(and(eq(listing.id, id), inArray(listing.status, ["published", "hidden"])))
      .returning({ slug: listing.slug, status: listing.status });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
    return { slug: updated.slug, status: updated.status };
  }

  static async listUsers(): Promise<AdminUserDTO[]> {
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        deletedAt: user.deletedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      isAdmin: r.isAdmin ?? false,
      createdAt: r.createdAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    }));
  }

  // Блокиране = soft-delete (deletedAt) + инвалидация на живите сесии. Enforcement-ът е в
  // getCurrentUser (единствен choke-point). Self-guard: админ не блокира себе си.
  static async blockUser(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw new TRPCError({ code: "FORBIDDEN", message: "SELF_ACTION" });
    await db.transaction(async (tx) => {
      await tx.update(user).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(user.id, targetId));
      await tx.delete(session).where(eq(session.userId, targetId));
    });
  }

  static async unblockUser(targetId: string): Promise<void> {
    await db.update(user).set({ deletedAt: null, updatedAt: new Date() }).where(eq(user.id, targetId));
  }

  // Self-guard: админ не де-админва (нито промотира) себе си — предпазва от заключване извън панела.
  static async setAdmin(actorId: string, targetId: string, value: boolean): Promise<void> {
    if (actorId === targetId) throw new TRPCError({ code: "FORBIDDEN", message: "SELF_ACTION" });
    await db.update(user).set({ isAdmin: value, updatedAt: new Date() }).where(eq(user.id, targetId));
  }

  static getSettings(): Promise<BillingSettings> {
    return getBillingSettings();
  }

  // Per-ключ upsert (target=setting.key). getBillingSettings чете некеширано → важи веднага.
  static async updateSettings(input: BillingSettingsInput): Promise<BillingSettings> {
    await db.transaction(async (tx) => {
      await tx.insert(setting).values({ key: "billing.limits", value: input.limits })
        .onConflictDoUpdate({ target: setting.key, set: { value: input.limits } });
      await tx.insert(setting).values({ key: "billing.graceDays", value: input.graceDays })
        .onConflictDoUpdate({ target: setting.key, set: { value: input.graceDays } });
      await tx.insert(setting).values({ key: "billing.promo", value: input.promo })
        .onConflictDoUpdate({ target: setting.key, set: { value: input.promo } });
    });
    return getBillingSettings();
  }

  // 5 скаларни count-а паралелно (Promise.all). Скаларна select({ n: count() }) конвенция.
  static async dashboardStats(): Promise<AdminDashboardStatsDTO> {
    const now = new Date();
    const [pending, published, activeUsers, subs, promos] = await Promise.all([
      db.select({ n: count() }).from(listing).where(eq(listing.status, "pending_approval")),
      db.select({ n: count() }).from(listing).where(eq(listing.status, "published")),
      db.select({ n: count() }).from(user).where(isNull(user.deletedAt)),
      db.select({ n: count() }).from(subscription).where(eq(subscription.status, "active")),
      db.select({ n: count() }).from(promotion).where(and(lte(promotion.startsAt, now), gt(promotion.endsAt, now))),
    ]);
    return {
      pendingListings: pending[0]?.n ?? 0,
      publishedListings: published[0]?.n ?? 0,
      users: activeUsers[0]?.n ?? 0,
      activeSubscriptions: subs[0]?.n ?? 0,
      activePromotions: promos[0]?.n ?? 0,
    };
  }

  static async createCategory(input: CategoryCreateInput): Promise<{ id: string }> {
    try {
      const [row] = await db
        .insert(category)
        .values({ slug: input.slug, nameBg: input.nameBg, nameEn: input.nameEn, sortOrder: input.sortOrder })
        .returning({ id: category.id });
      return row!;
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "SLUG_TAKEN" });
      throw err;
    }
  }

  static async updateCategory(input: CategoryUpdateInput): Promise<void> {
    const { id, ...rest } = input;
    if (Object.keys(rest).length === 0) return;
    try {
      await db.update(category).set(rest).where(eq(category.id, id));
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "SLUG_TAKEN" });
      throw err;
    }
  }

  // soft-delete: reuse съществуващия isActive флаг (каталогът чете isActive=true). Hard-delete извън scope.
  static async softDeleteCategory(id: string): Promise<void> {
    await db.update(category).set({ isActive: false }).where(eq(category.id, id));
  }

  // admin таблица: вкл. неактивни (за разлика от TaxonomyDAL.listCategories)
  static async listCategoriesAdmin(): Promise<CategoryRowDTO[]> {
    return db
      .select({
        id: category.id, slug: category.slug, nameBg: category.nameBg,
        nameEn: category.nameEn, sortOrder: category.sortOrder, isActive: category.isActive,
      })
      .from(category)
      .orderBy(asc(category.sortOrder));
  }

  static async createAttributeDefinition(input: AttributeDefinitionCreateInput): Promise<{ id: string }> {
    try {
      const [row] = await db
        .insert(attributeDefinition)
        .values({
          categoryId: input.categoryId, key: input.key, labelBg: input.labelBg, labelEn: input.labelEn,
          type: input.type, options: input.options, showAsFilter: input.showAsFilter,
          showAsChip: input.showAsChip, sortOrder: input.sortOrder,
        })
        .returning({ id: attributeDefinition.id });
      return row!;
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "KEY_TAKEN" });
      throw err;
    }
  }

  static async updateAttributeDefinition(input: AttributeDefinitionUpdateInput): Promise<void> {
    const [current] = await db
      .select({ type: attributeDefinition.type, options: attributeDefinition.options })
      .from(attributeDefinition)
      .where(eq(attributeDefinition.id, input.id));
    if (!current) throw new TRPCError({ code: "NOT_FOUND" });

    const typeChanged = current.type !== input.type;
    const currentValues = ((current.options as { value: string }[] | null) ?? []).map((o) => o.value);
    const nextValues = (input.options ?? []).map((o) => o.value);
    const optionRemoved = currentValues.some((v) => !nextValues.includes(v));

    // само разрушаващи промени (type-change / махнат option) блокират in-use дефиниция;
    // добавяне на option или пре-етикетиране е безопасно
    if (typeChanged || optionRemoved) {
      const [c] = await db
        .select({ n: count() })
        .from(listingAttribute)
        .where(eq(listingAttribute.attributeDefinitionId, input.id));
      if ((c?.n ?? 0) > 0) throw new TRPCError({ code: "CONFLICT", message: "ATTRIBUTE_IN_USE" });
    }

    try {
      await db
        .update(attributeDefinition)
        .set({
          categoryId: input.categoryId, key: input.key, labelBg: input.labelBg, labelEn: input.labelEn,
          type: input.type, options: input.options, showAsFilter: input.showAsFilter,
          showAsChip: input.showAsChip, sortOrder: input.sortOrder,
        })
        .where(eq(attributeDefinition.id, input.id));
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "KEY_TAKEN" });
      throw err;
    }
  }

  static async deleteAttributeDefinition(id: string): Promise<void> {
    const [c] = await db
      .select({ n: count() })
      .from(listingAttribute)
      .where(eq(listingAttribute.attributeDefinitionId, id));
    if ((c?.n ?? 0) > 0) throw new TRPCError({ code: "CONFLICT", message: "ATTRIBUTE_IN_USE" });
    await db.delete(attributeDefinition).where(eq(attributeDefinition.id, id));
  }

  // reuse на read-DAL: същият shape (AttributeDefinitionDTO[]), сортиран по sortOrder, вкл. options
  static listByCategoryAdmin(categoryId: string) {
    return AttributeDAL.public().definitionsByCategory(categoryId);
  }

  static async listRegions(): Promise<RegionRowDTO[]> {
    return db
      .select({ id: region.id, slug: region.slug, name: region.name })
      .from(region)
      .orderBy(asc(region.name));
  }

  static async createRegion(input: RegionCreateInput): Promise<{ id: string }> {
    try {
      const [row] = await db.insert(region).values({ slug: input.slug, name: input.name }).returning({ id: region.id });
      return row!;
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "SLUG_TAKEN" });
      throw err;
    }
  }

  static async updateRegion(input: RegionUpdateInput): Promise<void> {
    try {
      await db.update(region).set({ slug: input.slug, name: input.name }).where(eq(region.id, input.id));
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "SLUG_TAKEN" });
      throw err;
    }
  }

  // guard: регионът не може да се трие, докато има градове или service-region обвързаности
  static async deleteRegion(id: string): Promise<void> {
    const [cityCount] = await db.select({ n: count() }).from(city).where(eq(city.regionId, id));
    const [lsrCount] = await db.select({ n: count() }).from(listingServiceRegion).where(eq(listingServiceRegion.regionId, id));
    if ((cityCount?.n ?? 0) > 0 || (lsrCount?.n ?? 0) > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "REGION_IN_USE" });
    }
    await db.delete(region).where(eq(region.id, id));
  }

  static async createCity(input: CityCreateInput): Promise<{ id: string }> {
    try {
      const [row] = await db
        .insert(city)
        .values({ regionId: input.regionId, slug: input.slug, name: input.name })
        .returning({ id: city.id });
      return row!;
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "SLUG_TAKEN" });
      if (pgCode(err) === "23503") throw new TRPCError({ code: "NOT_FOUND", message: "REGION_NOT_FOUND" });
      throw err;
    }
  }

  static async updateCity(input: CityUpdateInput): Promise<void> {
    try {
      await db
        .update(city)
        .set({ regionId: input.regionId, slug: input.slug, name: input.name })
        .where(eq(city.id, input.id));
    } catch (err) {
      if (pgCode(err) === "23505") throw new TRPCError({ code: "CONFLICT", message: "SLUG_TAKEN" });
      throw err;
    }
  }

  // guard: градът не може да се трие, докато има обяви
  static async deleteCity(id: string): Promise<void> {
    const [c] = await db.select({ n: count() }).from(listing).where(eq(listing.cityId, id));
    if ((c?.n ?? 0) > 0) throw new TRPCError({ code: "CONFLICT", message: "CITY_IN_USE" });
    await db.delete(city).where(eq(city.id, id));
  }

  static async listCitiesByRegion(regionId: string): Promise<CityRowDTO[]> {
    return db
      .select({ id: city.id, regionId: city.regionId, slug: city.slug, name: city.name })
      .from(city)
      .where(eq(city.regionId, regionId))
      .orderBy(asc(city.name));
  }

  static async listReports(): Promise<ReportRowDTO[]> {
    const rows = await db
      .select({
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        reporterEmail: user.email,
        createdAt: report.createdAt,
      })
      .from(report)
      .innerJoin(user, eq(report.reporterId, user.id))
      .where(eq(report.status, "open"))
      .orderBy(desc(report.createdAt));

    const reviewIds = rows.filter((r) => r.targetType === "review").map((r) => r.targetId);
    const questionIds = rows.filter((r) => r.targetType === "question").map((r) => r.targetId);
    const listingIds = rows.filter((r) => r.targetType === "listing").map((r) => r.targetId);

    const [reviewRows, questionRows, listingRows] = await Promise.all([
      reviewIds.length
        ? db.select({ id: review.id, excerpt: review.title, slug: listing.slug })
            .from(review).innerJoin(listing, eq(review.listingId, listing.id))
            .where(inArray(review.id, reviewIds))
        : Promise.resolve([]),
      questionIds.length
        ? db.select({ id: question.id, excerpt: question.body, slug: listing.slug })
            .from(question).innerJoin(listing, eq(question.listingId, listing.id))
            .where(inArray(question.id, questionIds))
        : Promise.resolve([]),
      listingIds.length
        ? db.select({ id: listing.id, excerpt: listing.title, slug: listing.slug })
            .from(listing)
            .where(inArray(listing.id, listingIds))
        : Promise.resolve([]),
    ]);

    const reviewMap = new Map(reviewRows.map((r) => [r.id, r]));
    const questionMap = new Map(questionRows.map((r) => [r.id, r]));
    const listingMap = new Map(listingRows.map((r) => [r.id, r]));

    return rows.map((r) => {
      const t =
        r.targetType === "review" ? reviewMap.get(r.targetId)
        : r.targetType === "question" ? questionMap.get(r.targetId)
        : listingMap.get(r.targetId);
      const excerpt = t?.excerpt ?? null;
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        reporterEmail: r.reporterEmail,
        createdAt: r.createdAt.toISOString(),
        targetExcerpt: r.targetType === "question" && excerpt ? excerpt.slice(0, 80) : excerpt,
        targetListingSlug: t?.slug ?? null,
      };
    });
  }
}

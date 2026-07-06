import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attributeDefinition, listing, listingAttribute } from "@/db/schema";
import type { SessionUser } from "@/data/users/require-user";
import { canEditListing } from "./catalog.policy";
import type { AttributeDefinitionDTO, AttributeValueInput } from "./attribute.dto";

function validateValue(def: AttributeDefinitionDTO, value: unknown): void {
  const optionValues = (def.options ?? []).map((o) => o.value);
  const ok =
    def.type === "boolean" ? typeof value === "boolean"
    : def.type === "number" ? typeof value === "number" && Number.isFinite(value) && value >= 0
    : def.type === "single" ? typeof value === "string" && optionValues.includes(value)
    : Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string" && optionValues.includes(v));
  if (!ok) throw new Error("INVALID_ATTRIBUTE_VALUE");
}

export class AttributeDAL {
  private constructor(private readonly user: SessionUser | null) {}

  static for(user: SessionUser) {
    return new AttributeDAL(user);
  }

  static public() {
    return new AttributeDAL(null);
  }

  async definitionsByCategory(categoryId: string): Promise<AttributeDefinitionDTO[]> {
    const rows = await db
      .select()
      .from(attributeDefinition)
      .where(eq(attributeDefinition.categoryId, categoryId))
      .orderBy(asc(attributeDefinition.sortOrder));
    return rows.map((r) => ({
      id: r.id, key: r.key, labelBg: r.labelBg, labelEn: r.labelEn,
      type: r.type, options: (r.options as AttributeDefinitionDTO["options"]) ?? null,
      showAsFilter: r.showAsFilter, showAsChip: r.showAsChip, sortOrder: r.sortOrder,
    }));
  }

  async setValues(listingId: string, values: AttributeValueInput[]): Promise<void> {
    if (!this.user) throw new Error("FORBIDDEN");
    const [row] = await db.select().from(listing).where(eq(listing.id, listingId));
    if (!row) throw new Error("NOT_FOUND");
    if (!canEditListing(this.user, row)) throw new Error("FORBIDDEN");

    const defs = await this.definitionsByCategory(row.categoryId);
    const byId = new Map(defs.map((d) => [d.id, d]));
    for (const v of values) {
      const def = byId.get(v.definitionId);
      if (!def) throw new Error("INVALID_ATTRIBUTE_VALUE"); // дефиниция от друга категория
      validateValue(def, v.value);
    }

    if (new Set(values.map((v) => v.definitionId)).size !== values.length) {
      throw new Error("INVALID_ATTRIBUTE_VALUE");
    }

    await db.delete(listingAttribute).where(eq(listingAttribute.listingId, listingId));
    if (values.length > 0) {
      await db.insert(listingAttribute).values(
        values.map((v) => ({ listingId, attributeDefinitionId: v.definitionId, value: v.value })),
      );
    }
  }

  async getValues(listingId: string): Promise<{ definitionId: string; value: unknown }[]> {
    if (!this.user) throw new Error("FORBIDDEN");
    const [row] = await db.select().from(listing).where(eq(listing.id, listingId));
    if (!row) throw new Error("NOT_FOUND");
    if (!canEditListing(this.user, row)) throw new Error("FORBIDDEN");

    const rows = await db
      .select({ definitionId: listingAttribute.attributeDefinitionId, value: listingAttribute.value })
      .from(listingAttribute)
      .where(eq(listingAttribute.listingId, listingId));
    return rows;
  }
}

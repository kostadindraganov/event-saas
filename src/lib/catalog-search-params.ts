import type { PublicListingFilterInput } from "@/data/catalog/public.dto";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";

export const PER_PAGE = 24;
export const MAX_PAGE = 50;

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function intParam(v: string | string[] | undefined): number | undefined {
  const raw = one(v);
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidParam(v: string | string[] | undefined): string | undefined {
  const raw = one(v);
  if (raw === undefined || raw === "") return undefined;
  return UUID_RE.test(raw) ? raw : undefined;
}

export function parseSort(sp: SP): "new" | "priceAsc" | "priceDesc" {
  const s = one(sp.sort);
  return s === "priceAsc" || s === "priceDesc" ? s : "new";
}

export function parseView(sp: SP): "list" | "map" {
  return one(sp.view) === "map" ? "map" : "list";
}

export function parsePage(sp: SP): number {
  const n = Number(one(sp.page));
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

export function parseAttrs(
  sp: SP,
  definitions: AttributeDefinitionDTO[],
): { definitionId: string; values: string[] }[] {
  const out: { definitionId: string; values: string[] }[] = [];
  for (const def of definitions) {
    if (!def.showAsFilter) continue;
    const raw = one(sp[`attr_${def.id}`]);
    if (!raw) continue;
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (values.length) out.push({ definitionId: def.id, values });
  }
  return out;
}

export function parseListParams(
  sp: SP,
  categoryId: string,
  definitions: AttributeDefinitionDTO[],
  override?: { cityId?: string; regionId?: string },
): PublicListingFilterInput {
  return {
    categoryId,
    cityId: override?.cityId ?? uuidParam(sp.city),
    regionId: override?.regionId ?? uuidParam(sp.region),
    priceMinCents: intParam(sp.priceMin),
    priceMaxCents: intParam(sp.priceMax),
    attrs: parseAttrs(sp, definitions),
    sort: parseSort(sp),
    page: parsePage(sp),
    perPage: PER_PAGE,
  };
}

export function pageWindow(current: number, total: number): (number | "…")[] {
  const wanted = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

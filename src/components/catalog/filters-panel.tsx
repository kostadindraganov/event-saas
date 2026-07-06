"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";
import { CityCombobox, type CityOption } from "@/components/vendor/city-combobox";
import { parseEuroToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type FilterState = {
  cityId?: string;
  priceMinCents?: number;
  priceMaxCents?: number;
  attrs: Record<string, string[]>;
};

function countActive(current: FilterState): number {
  let n = 0;
  if (current.cityId) n++;
  if (current.priceMinCents != null) n++;
  if (current.priceMaxCents != null) n++;
  n += Object.values(current.attrs).filter((v) => v.length > 0).length;
  return n;
}

function FiltersForm({
  definitions,
  current,
  hideCity,
  onDone,
}: {
  definitions: AttributeDefinitionDTO[];
  current: FilterState;
  hideCity?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("Catalog");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [city, setCity] = useState<CityOption | null>(null);
  const [priceMin, setPriceMin] = useState(
    current.priceMinCents != null ? String(current.priceMinCents / 100) : "",
  );
  const [priceMax, setPriceMax] = useState(
    current.priceMaxCents != null ? String(current.priceMaxCents / 100) : "",
  );
  const [attrs, setAttrs] = useState<Record<string, string[]>>(current.attrs);

  function toggleMulti(defId: string, value: string) {
    setAttrs((prev) => {
      const cur = prev[defId] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [defId]: next };
    });
  }

  function setSingle(defId: string, value: string) {
    setAttrs((prev) => ({ ...prev, [defId]: [value] }));
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (!hideCity && city) params.set("city", city.id);
    const min = priceMin ? parseEuroToCents(priceMin) : null;
    const max = priceMax ? parseEuroToCents(priceMax) : null;
    if (min != null) params.set("priceMin", String(min));
    else params.delete("priceMin");
    if (max != null) params.set("priceMax", String(max));
    else params.delete("priceMax");
    for (const def of definitions) {
      const vals = attrs[def.id] ?? [];
      if (vals.length) params.set(`attr_${def.id}`, vals.join(","));
      else params.delete(`attr_${def.id}`);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    onDone?.();
  }

  function reset() {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ["city", "region", "priceMin", "priceMax", "page"]) params.delete(k);
    for (const def of definitions) params.delete(`attr_${def.id}`);
    setCity(null);
    setPriceMin("");
    setPriceMax("");
    setAttrs({});
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    onDone?.();
  }

  return (
    <div className="space-y-6">
      {!hideCity && (
        <div className="space-y-2">
          <Label>{t("filtersCity")}</Label>
          {/* ponytail: при hard reload с ?city= името не се resolve-ва (няма cityById метод) — combobox позволява ре-избор */}
          <CityCombobox value={city} onChange={setCity} />
        </div>
      )}

      <div className="space-y-2">
        <Label>{t("filtersPrice")}</Label>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            placeholder={t("filtersPriceMin")}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="h-11"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="numeric"
            placeholder={t("filtersPriceMax")}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {definitions.map((def) => {
        const options = def.options ?? [];
        const selected = attrs[def.id] ?? [];
        const label = locale === "bg" ? def.labelBg : def.labelEn;
        return (
          <div key={def.id} className="space-y-2">
            <Label>{label}</Label>
            <div className="space-y-1">
              {options.map((opt) => {
                const optLabel = locale === "bg" ? opt.labelBg : opt.labelEn;
                if (def.type === "single") {
                  return (
                    <label
                      key={opt.value}
                      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                    >
                      <input
                        type="radio"
                        name={`attr_${def.id}`}
                        checked={selected[0] === opt.value}
                        onChange={() => setSingle(def.id, opt.value)}
                        className="size-4 accent-primary"
                      />
                      {optLabel}
                    </label>
                  );
                }
                return (
                  <label
                    key={opt.value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                  >
                    <Checkbox
                      checked={selected.includes(opt.value)}
                      onCheckedChange={() => toggleMulti(def.id, opt.value)}
                    />
                    {optLabel}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button onClick={apply} className="h-11 flex-1">
          {t("apply")}
        </Button>
        <Button onClick={reset} variant="outline" className="h-11">
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}

export function FiltersPanel({
  definitions,
  current,
  hideCity,
}: {
  definitions: AttributeDefinitionDTO[];
  current: FilterState;
  hideCity?: boolean;
}) {
  const t = useTranslations("Catalog");
  const [open, setOpen] = useState(false);
  const filterable = definitions.filter(
    (d) => d.showAsFilter && (d.type === "single" || d.type === "multi"),
  );
  const active = countActive(current);

  return (
    <>
      <aside className="hidden w-64 shrink-0 lg:block">
        <FiltersForm definitions={filterable} current={current} hideCity={hideCity} />
      </aside>

      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 gap-2">
              <SlidersHorizontal className="size-4" />
              {t("filters")}
              {active > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-xs tabular-nums text-primary-foreground">
                  {active}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
            <SheetTitle className="mb-4 font-serif text-2xl">{t("filters")}</SheetTitle>
            <FiltersForm
              definitions={filterable}
              current={current}
              hideCity={hideCity}
              onDone={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

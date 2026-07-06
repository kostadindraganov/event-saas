"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Values = Record<string, unknown>;

function isFilled(def: AttributeDefinitionDTO, v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (def.type === "multi") return Array.isArray(v) && v.length > 0;
  if (def.type === "number") return typeof v === "number" && Number.isFinite(v);
  if (def.type === "single") return typeof v === "string" && v.length > 0;
  return typeof v === "boolean";
}

export function StepAtributi({
  listing,
  definitions,
}: {
  listing: ListingDTO;
  definitions: AttributeDefinitionDTO[];
}) {
  const locale = useLocale();
  const t = useTranslations("Vendor");
  const tw = useTranslations("Vendor.wizard");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const getValuesQO = trpc.catalog.attribute.getValues.queryOptions({ listingId: listing.id });
  const { data: saved } = useQuery(getValuesQO);
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState(false);

  // Hydrate local state from the loaded/refetched values during render
  // (React's recommended replacement for setState-in-effect).
  const [hydratedFrom, setHydratedFrom] = useState<typeof saved>(undefined);
  if (saved && saved !== hydratedFrom) {
    setHydratedFrom(saved);
    setValues(Object.fromEntries(saved.map((v) => [v.definitionId, v.value])));
  }

  const save = useMutation(
    trpc.catalog.attribute.setValues.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getValuesQO.queryKey });
        toast.success(tw("saved"));
      },
      onError: () => setError(true),
    }),
  );

  const label = (d: AttributeDefinitionDTO) => (locale === "bg" ? d.labelBg : d.labelEn);
  const optLabel = (o: { labelBg: string; labelEn: string }) => (locale === "bg" ? o.labelBg : o.labelEn);
  const set = (id: string, v: unknown) => setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(false);
        save.mutate({
          listingId: listing.id,
          values: definitions
            .filter((d) => isFilled(d, values[d.id]))
            .map((d) => ({ definitionId: d.id, value: values[d.id] as never })),
        });
      }}
    >
      {definitions.map((d) => (
        <div key={d.id} className="space-y-2">
          {d.type === "boolean" && (
            <div className="flex items-center gap-3">
              <Switch
                id={d.id}
                checked={values[d.id] === true}
                onCheckedChange={(on) => set(d.id, on)}
              />
              <Label htmlFor={d.id}>{label(d)}</Label>
            </div>
          )}
          {d.type === "number" && (
            <>
              <Label htmlFor={d.id}>{label(d)}</Label>
              <Input
                id={d.id}
                type="number"
                min={0}
                className="max-w-40"
                value={typeof values[d.id] === "number" ? String(values[d.id]) : ""}
                onChange={(e) => set(d.id, e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </>
          )}
          {d.type === "single" && d.options && (
            <>
              <Label>{label(d)}</Label>
              <Select
                value={typeof values[d.id] === "string" ? (values[d.id] as string) : ""}
                onValueChange={(v) => set(d.id, v)}
              >
                <SelectTrigger className="max-w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {d.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{optLabel(o)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {d.type === "multi" && d.options && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{label(d)}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {d.options.map((o) => {
                  const arr = Array.isArray(values[d.id]) ? (values[d.id] as string[]) : [];
                  return (
                    <label key={o.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={arr.includes(o.value)}
                        onCheckedChange={(on) =>
                          set(d.id, on ? [...arr, o.value] : arr.filter((x) => x !== o.value))
                        }
                      />
                      {optLabel(o)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? tw("saving") : tw("save")}
      </Button>
    </form>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { CityCombobox, type CityOption } from "../city-combobox";

export function StepOsnovni({ listing }: { listing: ListingDTO }) {
  const t = useTranslations("Vendor");
  const tw = useTranslations("Vendor.wizard");
  const trpc = useTRPC();
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [city, setCity] = useState<CityOption | null>(null);
  const [wholeCountry, setWholeCountry] = useState(listing.wholeCountry);
  const [regionIds, setRegionIds] = useState<string[]>(listing.serviceRegionIds);

  const { data: regions } = useQuery(trpc.catalog.location.listRegions.queryOptions());
  const update = useMutation(
    trpc.catalog.listing.update.mutationOptions({ onSuccess: () => toast.success(tw("saved")) }),
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({
          id: listing.id,
          title: title.trim(),
          description,
          ...(city ? { cityId: city.id } : {}),
          wholeCountry,
          serviceRegionIds: wholeCountry ? [] : regionIds,
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="w-title">{t("fieldTitle")}</Label>
        <Input id="w-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="w-desc">{t("fieldDescription")}</Label>
        <Textarea id="w-desc" rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{t("fieldCity")} <span className="text-muted-foreground">{t("cityKeep")}</span></Label>
        <CityCombobox value={city} onChange={setCity} />
      </div>
      <div className="flex items-center gap-3">
        <Switch id="w-country" checked={wholeCountry} onCheckedChange={setWholeCountry} />
        <Label htmlFor="w-country">{t("wholeCountry")}</Label>
      </div>
      {!wholeCountry && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("serviceRegions")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {regions?.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={regionIds.includes(r.id)}
                  onCheckedChange={(on) =>
                    setRegionIds((prev) => (on ? [...prev, r.id] : prev.filter((x) => x !== r.id)))
                  }
                />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Button type="submit" disabled={update.isPending || title.trim().length < 3}>
        {update.isPending ? tw("saving") : tw("save")}
      </Button>
    </form>
  );
}

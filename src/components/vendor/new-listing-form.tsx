"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CityCombobox, type CityOption } from "./city-combobox";

export function NewListingForm() {
  const t = useTranslations("Vendor");
  const locale = useLocale();
  const router = useRouter();
  const trpc = useTRPC();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [city, setCity] = useState<CityOption | null>(null);

  const [error, setError] = useState(false);
  const { data: categories } = useQuery(trpc.catalog.category.list.queryOptions());
  const createDraft = useMutation(
    trpc.catalog.listing.createDraft.mutationOptions({
      onSuccess: (listing) => router.push(`/profil/dostavchik/obiavi/${listing.id}`),
      onError: () => setError(true),
    }),
  );

  const valid = title.trim().length >= 3 && categoryId && city;

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(false);
        if (!valid || !city) return;
        createDraft.mutate({ title: title.trim(), categoryId, cityId: city.id });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">{t("fieldTitle")}</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{t("fieldCategory")}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {locale === "bg" ? c.nameBg : c.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("fieldCity")}</Label>
        <CityCombobox value={city} onChange={setCity} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{t("errorCreate")}</p>}
      <Button type="submit" disabled={!valid || createDraft.isPending}>
        {createDraft.isPending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}

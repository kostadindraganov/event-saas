"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/client";
import { Input } from "@/components/ui/input";

export type CityOption = { id: string; name: string; regionName: string };

export function CityCombobox({
  value,
  onChange,
}: {
  value: CityOption | null;
  onChange: (city: CityOption) => void;
}) {
  const t = useTranslations("Vendor");
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data: hits } = useQuery({
    ...trpc.catalog.location.searchCities.queryOptions({ query }),
    enabled: query.length >= 1,
  });

  return (
    <div className="relative">
      <Input
        value={open ? query : (value ? `${value.name} (${value.regionName})` : query)}
        placeholder={t("citySearchPlaceholder")}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && hits && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border bg-card shadow-sm">
          {hits.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(c);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {c.name} <span className="text-muted-foreground">({c.regionName})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

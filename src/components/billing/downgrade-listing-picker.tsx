"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { SystemHiddenListingDTO } from "@/data/billing/billing.dto";

export function DowngradeListingPicker({ listings }: { listings: SystemHiddenListingDTO[] }) {
  const t = useTranslations("Billing.picker");
  const trpc = useTRPC();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const keep = useMutation(
    trpc.billing.keepListing.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: () => setError(true),
    }),
  );

  if (listings.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <p className="font-medium">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <fieldset className="space-y-1">
          {listings.map((l) => (
            <label
              key={l.id}
              className="flex min-h-11 items-center gap-3 rounded-md border border-border p-2 text-sm has-checked:border-primary"
            >
              <input
                type="radio"
                name="keep-listing"
                value={l.id}
                checked={selected === l.id}
                onChange={() => setSelected(l.id)}
                className="size-4"
              />
              <span>{l.title}</span>
              <span className="text-muted-foreground">· {l.categoryName}</span>
            </label>
          ))}
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{t("error")}</p>}
        <Button
          disabled={!selected || keep.isPending}
          onClick={() => {
            if (!selected) return;
            setError(false);
            keep.mutate({ listingId: selected });
          }}
        >
          {keep.isPending ? t("confirming") : t("confirm")}
        </Button>
      </CardContent>
    </Card>
  );
}

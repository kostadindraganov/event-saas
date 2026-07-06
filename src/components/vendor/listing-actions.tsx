"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/data/catalog/catalog.dto";

export function ListingActions({ id, status }: { id: string; status: ListingStatus }) {
  const t = useTranslations("Vendor");
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = () => router.refresh();
  const [error, setError] = useState(false);
  const hide = useMutation(trpc.catalog.listing.hide.mutationOptions({ onSuccess: refresh, onError: () => setError(true) }));
  const unhide = useMutation(trpc.catalog.listing.unhide.mutationOptions({ onSuccess: refresh, onError: () => setError(true) }));

  if (status === "published") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={hide.isPending} onClick={() => { setError(false); hide.mutate({ id }); }}>
          {t("hide")}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
      </div>
    );
  }
  if (status === "hidden") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={unhide.isPending} onClick={() => { setError(false); unhide.mutate({ id }); }}>
          {t("unhide")}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
      </div>
    );
  }
  return null;
}

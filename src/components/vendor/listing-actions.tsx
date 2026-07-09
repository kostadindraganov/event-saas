"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/data/catalog/catalog.dto";

export function ListingActions({ id, status }: { id: string; status: ListingStatus }) {
  const t = useTranslations("Vendor");
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = () => router.refresh();
  const tb = useTranslations("Billing");
  const [errorKey, setErrorKey] = useState<"errorSave" | "noSubscription" | "limitReached" | null>(null);
  const hide = useMutation(trpc.catalog.listing.hide.mutationOptions({ onSuccess: refresh, onError: () => setErrorKey("errorSave") }));
  const unhide = useMutation(trpc.catalog.listing.unhide.mutationOptions({
    onSuccess: refresh,
    onError: (err) => {
      if (err.data?.code === "FORBIDDEN" && err.message === "NO_SUBSCRIPTION") setErrorKey("noSubscription");
      else if (err.data?.code === "FORBIDDEN" && err.message === "LIMIT_REACHED") setErrorKey("limitReached");
      else setErrorKey("errorSave");
    },
  }));

  if (status === "published") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="default" disabled={hide.isPending} onClick={() => { setErrorKey(null); hide.mutate({ id }); }}>
          {t("hide")}
        </Button>
        {errorKey && <p role="alert" className="text-sm text-destructive">{t("errorSave")}</p>}
      </div>
    );
  }
  if (status === "hidden") {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="default" disabled={unhide.isPending} onClick={() => { setErrorKey(null); unhide.mutate({ id }); }}>
          {t("unhide")}
        </Button>
        {errorKey && (
          <p role="alert" className="text-sm text-destructive">
            {errorKey === "errorSave" ? t("errorSave") : tb(errorKey === "noSubscription" ? "gate.noSubscription" : "gate.limitReached")}
            {errorKey !== "errorSave" && (
              <>
                {" "}
                <Link href="/profil/dostavchik/abonament" className="underline">{tb("gate.cta")}</Link>
              </>
            )}
          </p>
        )}
      </div>
    );
  }
  return null;
}

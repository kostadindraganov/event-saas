"use client";
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
  const hide = useMutation(trpc.catalog.listing.hide.mutationOptions({ onSuccess: refresh }));
  const unhide = useMutation(trpc.catalog.listing.unhide.mutationOptions({ onSuccess: refresh }));

  if (status === "published") {
    return (
      <Button variant="ghost" size="sm" disabled={hide.isPending} onClick={() => hide.mutate({ id })}>
        {t("hide")}
      </Button>
    );
  }
  if (status === "hidden") {
    return (
      <Button variant="ghost" size="sm" disabled={unhide.isPending} onClick={() => unhide.mutate({ id })}>
        {t("unhide")}
      </Button>
    );
  }
  return null;
}

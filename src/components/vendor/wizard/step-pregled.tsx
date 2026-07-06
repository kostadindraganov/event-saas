"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";
import { Button } from "@/components/ui/button";
import { ListingStatusBadge } from "../listing-status-badge";

export function StepPregled({
  listing,
  definitions,
}: {
  listing: ListingDTO;
  definitions: AttributeDefinitionDTO[];
}) {
  const t = useTranslations("Vendor.review");
  const tv = useTranslations("Vendor");
  const locale = useLocale();
  const trpc = useTRPC();
  const router = useRouter();
  const [error, setError] = useState(false);

  const { data: images } = useQuery(trpc.media.listByListing.queryOptions({ listingId: listing.id }));
  const { data: videos } = useQuery(trpc.catalog.video.listByListing.queryOptions({ listingId: listing.id }));
  const { data: packages } = useQuery(trpc.catalog.package.listByListing.queryOptions({ listingId: listing.id }));
  const { data: values } = useQuery(trpc.catalog.attribute.getValues.queryOptions({ listingId: listing.id }));

  const submit = useMutation(
    trpc.catalog.listing.submit.mutationOptions({
      onSuccess: () => { toast.success(t("published")); router.refresh(); },
      onError: () => setError(true),
    }),
  );
  const hide = useMutation(
    trpc.catalog.listing.hide.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: () => setError(true),
    }),
  );

  const byId = new Map(definitions.map((d) => [d.id, d]));
  const canPublish = listing.status === "draft" || listing.status === "rejected";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ListingStatusBadge status={listing.status} />
        <span className="text-sm text-muted-foreground">
          {t("imagesCount", { count: images?.length ?? 0 })} · {t("videosCount", { count: videos?.length ?? 0 })} · {t("packagesCount", { count: packages?.length ?? 0 })}
        </span>
      </div>
      {listing.status === "rejected" && listing.rejectionReason && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <strong>{t("rejectedReason")}:</strong> {listing.rejectionReason}
        </p>
      )}
      <div className="space-y-2">
        <h2 className="font-serif text-2xl">{listing.title}</h2>
        <p className="whitespace-pre-line text-sm text-muted-foreground">{listing.description}</p>
      </div>
      {values && values.length > 0 && (
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {values.map((v) => {
            const d = byId.get(v.definitionId);
            if (!d) return null;
            return (
              <li key={v.definitionId}>
                <span className="text-muted-foreground">{locale === "bg" ? d.labelBg : d.labelEn}:</span>{" "}
                {Array.isArray(v.value) ? (v.value as string[]).join(", ") : String(v.value)}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{tv("errorSave")}</p>}
      {canPublish ? (
        <Button size="lg" disabled={submit.isPending} onClick={() => { setError(false); submit.mutate({ id: listing.id }); }}>
          {submit.isPending ? t("publishing") : t("publish")}
        </Button>
      ) : listing.status === "published" ? (
        <div className="flex items-center gap-3">
          <p className="text-sm">{t("published")}</p>
          <Button variant="outline" disabled={hide.isPending} onClick={() => { setError(false); hide.mutate({ id: listing.id }); }}>
            {tv("hide")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { useTRPC } from "@/trpc/client";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import type { AttributeDefinitionDTO } from "@/data/catalog/attribute.dto";
import { Button } from "@/components/ui/button";
import { ListingStatusBadge } from "../listing-status-badge";

function formatValue(
  d: AttributeDefinitionDTO,
  value: unknown,
  locale: string,
  t: (key: string) => string,
): string {
  if (d.type === "boolean") return value ? t("yes") : t("no");
  const optLabel = (v: string) => {
    const opt = d.options?.find((o) => o.value === v);
    return opt ? (locale === "bg" ? opt.labelBg : opt.labelEn) : v;
  };
  if (d.type === "multi" && Array.isArray(value)) return (value as string[]).map(optLabel).join(", ");
  if (d.type === "single" && typeof value === "string") return optLabel(value);
  return String(value);
}

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
  const tb = useTranslations("Billing");
  const [errorKey, setErrorKey] = useState<"errorSave" | "noSubscription" | "limitReached" | null>(null);

  const { data: images } = useQuery(trpc.media.listByListing.queryOptions({ listingId: listing.id }));
  const { data: videos } = useQuery(trpc.catalog.video.listByListing.queryOptions({ listingId: listing.id }));
  const { data: packages } = useQuery(trpc.catalog.package.listByListing.queryOptions({ listingId: listing.id }));
  const { data: values } = useQuery(trpc.catalog.attribute.getValues.queryOptions({ listingId: listing.id }));

  const submit = useMutation(
    trpc.catalog.listing.submit.mutationOptions({
      onSuccess: () => { toast.success(t("published")); router.refresh(); },
      // billing entitlement грешки (err.data?.code==="FORBIDDEN" + err.message) → отделен CTA към абонамента;
      // idiom по inquiry-form.tsx (err.data?.code branch)
      onError: (err) => {
        if (err.data?.code === "FORBIDDEN" && err.message === "NO_SUBSCRIPTION") setErrorKey("noSubscription");
        else if (err.data?.code === "FORBIDDEN" && err.message === "LIMIT_REACHED") setErrorKey("limitReached");
        else setErrorKey("errorSave");
      },
    }),
  );
  const hide = useMutation(
    trpc.catalog.listing.hide.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: () => setErrorKey("errorSave"),
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
                {formatValue(d, v.value, locale, t)}
              </li>
            );
          })}
        </ul>
      )}
      {errorKey && (
        <p role="alert" className="text-sm text-destructive">
          {errorKey === "errorSave" ? tv("errorSave") : tb(errorKey === "noSubscription" ? "gate.noSubscription" : "gate.limitReached")}
          {errorKey !== "errorSave" && (
            <>
              {" "}
              <Link href="/profil/dostavchik/abonament" className="underline">{tb("gate.cta")}</Link>
            </>
          )}
        </p>
      )}
      {canPublish ? (
        <Button size="lg" disabled={submit.isPending} onClick={() => { setErrorKey(null); submit.mutate({ id: listing.id }); }}>
          {submit.isPending ? t("publishing") : t("publish")}
        </Button>
      ) : listing.status === "published" ? (
        <div className="flex items-center gap-3">
          <p className="text-sm">{t("published")}</p>
          <Button variant="outline" disabled={hide.isPending} onClick={() => { setErrorKey(null); hide.mutate({ id: listing.id }); }}>
            {tv("hide")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

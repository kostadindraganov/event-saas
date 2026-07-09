"use client";
import dynamic from "next/dynamic";
import type { PinLinkMode } from "@/lib/map-links";
import type { PublicListingCityCount } from "@/data/catalog/public.dto";

const Inner = dynamic(
  () => import("./listing-map-inner").then((m) => m.ListingMapInner),
  {
    ssr: false,
    loading: () => <div className="h-[70vh] min-h-[420px] w-full animate-pulse rounded-lg bg-muted" />,
  },
);

export function ListingMap(props: {
  pins: PublicListingCityCount[];
  mode: PinLinkMode;
  categorySlug: string;
  activeCitySlug?: string;
}) {
  return <Inner {...props} />;
}

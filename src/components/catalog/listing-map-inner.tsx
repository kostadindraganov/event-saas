"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { CITY_COORDS } from "@/data/catalog/city-coords";
import { cityPinHref, type PinLinkMode } from "@/lib/map-links";
import type { PublicListingCityCount } from "@/data/catalog/public.dto";

// център на България + zoom, покриващ цялата страна
const BG_CENTER: [number, number] = [42.73, 25.48];
const BG_ZOOM = 7;

function badge(count: number, active: boolean): L.DivIcon {
  const cls = active
    ? "flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-foreground px-2 text-xs font-semibold text-background shadow-md"
    : "flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-primary px-2 text-xs font-semibold text-primary-foreground shadow-md";
  return L.divIcon({
    className: "",
    html: `<div class="${cls}">${count}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function ListingMapInner({
  pins,
  mode,
  categorySlug,
  activeCitySlug,
}: {
  pins: PublicListingCityCount[];
  mode: PinLinkMode;
  categorySlug: string;
  activeCitySlug?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <MapContainer
      center={BG_CENTER}
      zoom={BG_ZOOM}
      scrollWheelZoom
      className="h-[70vh] min-h-[420px] w-full rounded-lg"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {pins.map((pin) => {
        const coords = CITY_COORDS[pin.slug];
        if (!coords) return null; // няма координата → без пин (не би трябвало за seed-натите 28)
        return (
          <Marker
            key={pin.cityId}
            position={coords as [number, number]}
            icon={badge(pin.count, pin.slug === activeCitySlug)}
            eventHandlers={{
              click: () =>
                router.push(cityPinHref({ mode, pin, categorySlug, currentParams: searchParams })),
            }}
          />
        );
      })}
    </MapContainer>
  );
}

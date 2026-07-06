"use client";
import type { ListingDTO } from "@/data/catalog/catalog.dto";
import { ImageUploader } from "./image-uploader";
import { VideoList } from "./video-list";
import { Separator } from "@/components/ui/separator";

export function StepGaleria({ listing }: { listing: ListingDTO }) {
  return (
    <div className="space-y-8">
      <ImageUploader listingId={listing.id} coverImageId={listing.coverImageId} />
      <Separator />
      <VideoList listingId={listing.id} />
    </div>
  );
}

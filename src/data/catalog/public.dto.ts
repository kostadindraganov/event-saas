import type { ServiceTypeDTO } from "@/data/booking/booking.dto";
import type { ReviewPublicDTO } from "@/data/reviews/review.dto";

export type PublicListingCardDTO = {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  categoryNameBg: string;
  categoryNameEn: string;
  cityName: string | null;
  wholeCountry: boolean;
  priceFromCents: number | null;
  ratingAvg: number | null; // parse от numeric; null докато няма ревюта
  reviewCount: number;
  coverCfImageId: string | null;
  publishedAt: string; // ISO string
  promoted: boolean; // активна промоция сега (startsAt <= now < endsAt)
};

export type PublicPackageDTO = {
  id: string;
  name: string;
  priceCents: number;        // от service_package.price_from_cents
  duration: string | null;
  included: string | null;
};

export type PublicListingDetailDTO = PublicListingCardDTO & {
  description: string;
  serviceRegionNames: string[];
  images: { cfImageId: string; sortOrder: number }[];
  videos: { youtubeVideoId: string }[]; // от listing_video.youtube_id
  packages: PublicPackageDTO[];
  chips: {
    definitionKey: string;
    labelBg: string;
    labelEn: string;
    valuesBg: string[];
    valuesEn: string[];
  }[];
  vendorAvgResponseMinutes: number | null; // user.avgResponseMinutes на listing.ownerId; бадж при ≤1440
  serviceTypes: ServiceTypeDTO[]; // само isActive=true, за BookingRequestForm
  reviews: ReviewPublicDTO[]; // visible ревюта, за секцията на страницата + JSON-LD Review[]
};

export type PublicListingFilterInput = {
  categoryId: string;
  cityId?: string;
  regionId?: string;
  priceMinCents?: number;
  priceMaxCents?: number;
  attrs?: { definitionId: string; values: string[] }[];
  sort: "new" | "priceAsc" | "priceDesc";
  page: number; // 1-based
  perPage: number; // 24
};

export type PublicListingPage = {
  items: PublicListingCardDTO[];
  total: number;
  page: number;
  perPage: number;
};

export type PublicListingCityCount = {
  cityId: string;
  slug: string;
  name: string;
  count: number;
};

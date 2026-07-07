export type AdminListingRowDTO = {
  id: string;
  title: string;
  status: "pending_approval" | "published";
  categoryNameBg: string;
  categoryNameEn: string;
  cityName: string;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  rejectionReason: string | null;
};

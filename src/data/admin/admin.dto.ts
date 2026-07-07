// Admin-only DTO: email е легитимен тук (админ управлява потребители). Не се излага публично.
export type AdminUserDTO = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  deletedAt: string | null;
};

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

export interface ThreadListItemDTO {
  id: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  coverImageId: string | null; // CF image id, през cfImageUrl() в UI
  role: "customer" | "vendor";
  counterpartName: string;
  lastMessageAt: Date;
  lastMessageBody: string;
  unreadCount: number;
}

export interface MessageDTO {
  id: string;
  mine: boolean;
  body: string;
  eventDate: string | null; // ISO date (yyyy-mm-dd)
  phone: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface ThreadDetailDTO {
  id: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  role: "customer" | "vendor";
  counterpartName: string;
  messages: MessageDTO[]; // ASC по createdAt
}

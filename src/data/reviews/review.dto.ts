import { z } from "zod";

const rating = z.number().int().min(1).max(5);

export const SUB_RATING_KEYS = [
  "quality", "communication", "professionalism", "value", "flexibility",
] as const;

export type ReviewImageDTO = { id: string; cfImageId: string };

// публичен изглед (obiava страница + JSON-LD)
export type ReviewPublicDTO = {
  id: string;
  authorName: string;
  ratingOverall: number;          // parsed numeric→Number
  ratingQuality: number;
  ratingCommunication: number;
  ratingProfessionalism: number;
  ratingValue: number;
  ratingFlexibility: number;
  title: string;
  body: string;
  wouldRecommend: boolean;
  eventDate: string;              // "YYYY-MM-DD"
  replyText: string | null;
  replyUpdatedAt: Date | null;
  images: ReviewImageDTO[];
  createdAt: Date;
};

// авторов изглед (за да знае дали още може да редактира)
export type MyReviewDTO = ReviewPublicDTO & { editableUntil: Date; canEdit: boolean };

// vendor панел: ревю по обява на owner-а + статус (за да маркира скрито от admin)
export type VendorReviewDTO = ReviewPublicDTO & {
  listingTitle: string;
  status: "visible" | "hidden_by_admin";
};

export const ReviewCreateSchema = z.object({
  bookingId: z.uuid(),
  ratingQuality: rating,
  ratingCommunication: rating,
  ratingProfessionalism: rating,
  ratingValue: rating,
  ratingFlexibility: rating,
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(4000),
  wouldRecommend: z.boolean(),
});
export type ReviewCreateInput = z.infer<typeof ReviewCreateSchema>;

// автор редактира само текст+оценки; listingId/eventDate НЕ се пипат
export const ReviewEditSchema = z.object({
  id: z.uuid(),
  ratingQuality: rating,
  ratingCommunication: rating,
  ratingProfessionalism: rating,
  ratingValue: rating,
  ratingFlexibility: rating,
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(4000),
  wouldRecommend: z.boolean(),
});
export type ReviewEditInput = z.infer<typeof ReviewEditSchema>;

export const ReviewReplySchema = z.object({ reviewId: z.uuid(), text: z.string().min(3).max(2000) });
export type ReviewReplyInput = z.infer<typeof ReviewReplySchema>;

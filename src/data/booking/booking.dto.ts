import { z } from "zod";

export const SERVICE_KINDS = ["full_day", "hourly"] as const;
export const BOOKING_STATUSES = [
  "pending", "confirmed", "declined", "auto_declined",
  "completed", "cancelled_by_customer", "cancelled_by_vendor",
] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Дата на trust boundary: изисквай zero-padded ISO (иначе pg 22007 → 500 на публичния slots.day,
// а не-padnat низ би заобиколил past-date guard-а чрез лексикографско сравнение).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "INVALID_DATE");

export type ServiceTypeDTO = {
  id: string;
  listingId: string;
  kind: ServiceKind;
  name: string;
  durationMinutes: number | null;
  priceFromCents: number | null;
  isActive: boolean;
};

const serviceTypeFields = {
  listingId: z.uuid(),
  kind: z.enum(SERVICE_KINDS),
  name: z.string().min(2),
  durationMinutes: z.number().int().positive().nullable().optional(),
  priceFromCents: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
};

// hourly изисква durationMinutes > 0; full_day го забранява (null)
const durationMatchesKind = (d: { kind: ServiceKind; durationMinutes?: number | null }) =>
  d.kind === "hourly"
    ? typeof d.durationMinutes === "number" && d.durationMinutes > 0
    : d.durationMinutes == null;
const durationMsg = { message: "DURATION_KIND_MISMATCH", path: ["durationMinutes"] };

export const ServiceTypeCreateSchema = z.object(serviceTypeFields).refine(durationMatchesKind, durationMsg);
export type ServiceTypeCreateInput = z.infer<typeof ServiceTypeCreateSchema>;

// НЕ .partial() — пълна дефиниция (както AttributeDefinitionUpdateSchema в admin.dto.ts)
export const ServiceTypeUpdateSchema = z
  .object({ id: z.uuid(), ...serviceTypeFields })
  .refine(durationMatchesKind, durationMsg);
export type ServiceTypeUpdateInput = z.infer<typeof ServiceTypeUpdateSchema>;

export type AvailabilityRuleDTO = {
  id: string;
  listingId: string;
  weekday: number; // 0=понеделник … 6=неделя
  startTime: string; // "HH:MM:SS"
  endTime: string;
};

export const AvailabilityItemSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string(),
    endTime: z.string(),
  })
  .refine((d) => d.startTime < d.endTime, { message: "TIME_RANGE_INVALID", path: ["endTime"] });

// replace-all семантика — CalendarDAL.setAvailability трие старите правила на listing-а и вкарва тези
export const SetAvailabilitySchema = z.object({
  listingId: z.uuid(),
  rules: z.array(AvailabilityItemSchema),
});
export type SetAvailabilityInput = z.infer<typeof SetAvailabilitySchema>;

export type BlockedDateDTO = {
  id: string;
  listingId: string;
  date: string;
  note: string | null;
};

export const BlockedDateCreateSchema = z.object({
  listingId: z.uuid(),
  date: isoDate,
  note: z.string().optional(),
});
export type BlockedDateCreateInput = z.infer<typeof BlockedDateCreateSchema>;

export type SlotDTO = { startTime: string; endTime: string }; // "HH:MM"
export type AvailabilityDayDTO = { date: string; state: "free" | "busy" };

export type BookingDTO = {
  id: string;
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  serviceTypeId: string;
  serviceKind: ServiceKind;
  serviceName: string;
  customerId: string;
  customerName: string;
  status: BookingStatus;
  isFullDay: boolean;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  phone: string;
  message: string | null;
  declineReason: string | null;
  cancelReason: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
};

export type MyBookingDTO = BookingDTO & { hasReview: boolean };

export const BookingRequestSchema = z.object({
  listingId: z.uuid(),
  serviceTypeId: z.uuid(),
  eventDate: isoDate,
  startTime: z.string().optional(),
  phone: z.string().min(5),
  message: z.string().optional(),
});
export type BookingRequestInput = z.infer<typeof BookingRequestSchema>;

export const DeclineSchema = z.object({ id: z.uuid(), reason: z.string().min(3) });
export type DeclineInput = z.infer<typeof DeclineSchema>;

export const CancelSchema = z.object({ id: z.uuid(), reason: z.string().min(3) });
export type CancelInput = z.infer<typeof CancelSchema>;

export const AvailabilityMonthInput = z.object({
  listingId: z.uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export const SlotsDayInput = z.object({
  listingId: z.uuid(),
  serviceTypeId: z.uuid(),
  date: isoDate,
});

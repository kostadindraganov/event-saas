import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../init";
import { rateLimited } from "../rate-limit";
import { BookingDAL } from "@/data/booking/booking.dal";
import { CalendarDAL } from "@/data/booking/calendar.dal";
import {
  BookingRequestSchema,
  DeclineSchema,
  CancelSchema,
  AvailabilityMonthInput,
  SlotsDayInput,
  ServiceTypeCreateSchema,
  ServiceTypeUpdateSchema,
  SetAvailabilitySchema,
  BlockedDateCreateSchema,
} from "@/data/booking/booking.dto";

const byId = z.object({ id: z.uuid() });
const byListingId = z.object({ listingId: z.uuid() });

export const bookingRouter = createTRPCRouter({
  request: rateLimited("booking.request", 10, 3_600_000)
    .input(BookingRequestSchema)
    .mutation(({ ctx, input }) => BookingDAL.for(ctx.user).request(input)),
  // confirm/decline/cancel: без revalidateTag — публичният календар е live tRPC заявка
  // (booking.availability.month/slots.day), НЕ кеширан RSC; obiava/[slug] кешира само
  // serviceTypes (непроменени от тези мутации), затова няма какво да се инвалидира.
  confirm: protectedProcedure.input(byId).mutation(({ ctx, input }) => BookingDAL.for(ctx.user).confirm(input.id)),
  decline: protectedProcedure.input(DeclineSchema).mutation(({ ctx, input }) => BookingDAL.for(ctx.user).decline(input.id, input.reason)),
  cancel: protectedProcedure.input(CancelSchema).mutation(({ ctx, input }) => BookingDAL.for(ctx.user).cancel(input.id, input.reason)),
  listMine: protectedProcedure.query(({ ctx }) => BookingDAL.for(ctx.user).listMine()),
  icalFeed: protectedProcedure.query(({ ctx }) => CalendarDAL.for(ctx.user).getIcalUrl()),
  regenerateIcalToken: protectedProcedure.mutation(({ ctx }) => CalendarDAL.for(ctx.user).regenerateIcalToken()),
  revokeIcalToken: protectedProcedure.mutation(({ ctx }) => CalendarDAL.for(ctx.user).revokeIcalToken()),

  availability: createTRPCRouter({
    month: publicProcedure
      .input(AvailabilityMonthInput)
      .query(({ input }) => CalendarDAL.public().availabilityMonth(input.listingId, input.year, input.month)),
  }),
  slots: createTRPCRouter({
    day: publicProcedure
      .input(SlotsDayInput)
      .query(({ input }) => CalendarDAL.public().slotsDay(input.listingId, input.serviceTypeId, input.date)),
  }),
  serviceType: createTRPCRouter({
    listActive: publicProcedure
      .input(byListingId)
      .query(({ input }) => CalendarDAL.public().listActiveServiceTypes(input.listingId)),
  }),

  vendorCalendar: createTRPCRouter({
    // Кеш-инвалидирането е собственост на DAL-а: CalendarDAL.create/update/deleteServiceType
    // сами revalidate-ват `listing:${slug}` — router-ът не знае за тагове.
    serviceType: createTRPCRouter({
      list: protectedProcedure
        .input(byListingId)
        .query(({ ctx, input }) => CalendarDAL.for(ctx.user).listServiceTypes(input.listingId)),
      create: protectedProcedure
        .input(ServiceTypeCreateSchema)
        .mutation(({ ctx, input }) => CalendarDAL.for(ctx.user).createServiceType(input)),
      update: protectedProcedure
        .input(ServiceTypeUpdateSchema)
        .mutation(({ ctx, input }) => CalendarDAL.for(ctx.user).updateServiceType(input)),
      remove: protectedProcedure
        .input(byId)
        .mutation(({ ctx, input }) => CalendarDAL.for(ctx.user).deleteServiceType(input.id)),
    }),
    availability: createTRPCRouter({
      get: protectedProcedure
        .input(byListingId)
        .query(({ ctx, input }) => CalendarDAL.for(ctx.user).getAvailability(input.listingId)),
      set: protectedProcedure
        .input(SetAvailabilitySchema)
        .mutation(({ ctx, input }) => CalendarDAL.for(ctx.user).setAvailability(input)),
    }),
    blockedDate: createTRPCRouter({
      list: protectedProcedure
        .input(byListingId)
        .query(({ ctx, input }) => CalendarDAL.for(ctx.user).listBlockedDates(input.listingId)),
      // без revalidateTag — публичният календар се чете през live tRPC (booking.availability.month),
      // не кеширан RSC; нищо cached не се променя от блокиране/отблокиране на дата.
      create: protectedProcedure
        .input(BlockedDateCreateSchema)
        .mutation(({ ctx, input }) => CalendarDAL.for(ctx.user).createBlockedDate(input)),
      remove: protectedProcedure.input(byId).mutation(async ({ ctx, input }) => {
        await CalendarDAL.for(ctx.user).deleteBlockedDate(input.id);
        return { ok: true as const };
      }),
    }),
    incoming: protectedProcedure.query(({ ctx }) => CalendarDAL.for(ctx.user).listIncoming()),
  }),
});

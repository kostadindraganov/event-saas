import { CalendarDAL } from "@/data/booking/calendar.dal";
import { buildVendorCalendar, type IcalEvent } from "@/lib/ical";
import { getBaseUrl } from "@/lib/seo";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  const rows = await CalendarDAL.confirmedBookingsForIcalToken(token);
  if (rows === null) return new Response("Not found", { status: 404 });

  const base = getBaseUrl();
  const events: IcalEvent[] = rows.map((r) => ({
    uid: `${r.id}@event-review`,
    summary: `Зает — ${r.customerName} (${r.serviceName})`,
    location: r.listingTitle,
    description: `${base}/profil/dostavchik/kalendar?obiava=${r.listingId}`,
    isFullDay: r.isFullDay,
    eventDate: r.eventDate,
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  const ics = buildVendorCalendar(events, { dtstamp: new Date() });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="event-review.ics"',
      // bearer-token feed: никога да не се кешира от посредник (revoke трябва да е моментален)
      "cache-control": "private, no-store",
    },
  });
}

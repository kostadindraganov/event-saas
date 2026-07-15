import { BookingDAL } from "@/data/booking/booking.dal";
import { cronAuthorized } from "@/lib/cron-auth";

// VPS deploy бележка (ADR 0003 — без Vercel Cron): системен crontab на VPS-а вика този
// endpoint веднъж дневно (след subscriptions cron-а), напр.:
//   0 4 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/auto-complete
export async function POST(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const { completed, autoDeclined } = await BookingDAL.autoComplete();
    return Response.json({ completed, autoDeclined });
  } catch (e) {
    console.error("cron auto-complete failed", e);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}

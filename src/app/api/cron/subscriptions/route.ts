import { BillingDAL } from "@/data/billing/billing.dal";
import { cronAuthorized } from "@/lib/cron-auth";

// VPS deploy бележка (ADR 0003 — без Vercel Cron): системен crontab на VPS-а вика този
// endpoint веднъж дневно, напр.:
//   0 3 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/subscriptions
export async function POST(req: Request) {
  if (!cronAuthorized(req)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const { hidden } = await BillingDAL.expireGracePeriods();
    return Response.json({ hidden });
  } catch (e) {
    console.error("cron subscriptions failed", e);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}

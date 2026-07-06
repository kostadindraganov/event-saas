import { BillingDAL } from "@/data/billing/billing.dal";

// VPS deploy бележка (ADR 0003 — без Vercel Cron): системен crontab на VPS-а вика този
// endpoint веднъж дневно, напр.:
//   0 3 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/subscriptions
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const { hidden } = await BillingDAL.expireGracePeriods();
  return Response.json({ hidden });
}

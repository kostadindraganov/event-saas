import { ReviewDAL } from "@/data/reviews/review.dal";
import { yesterdaySofia } from "@/data/booking/slots";
import { reviewReminderEmail, sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/seo";

// fire-and-forget: findReminderTargets() вече връща email+listingTitle, затова не се
// нуждае от допълнителна DB заявка тук (за разлика от booking.dal.ts notify* helper-ите).
async function notifyReviewReminder(target: { email: string; listingTitle: string }): Promise<void> {
  const { subject, html } = reviewReminderEmail({
    listingTitle: target.listingTitle,
    reviewUrl: `${getBaseUrl()}/profil/rezervacii`,
  });
  await sendEmail({ to: target.email, subject, html });
}

// VPS deploy бележка (ADR 0003 — без Vercel Cron): системен crontab вика този endpoint веднъж дневно
// (след auto-complete), напр.:
//   30 4 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/review-reminder
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const targets = await ReviewDAL.findReminderTargets(yesterdaySofia());
    for (const t of targets) void notifyReviewReminder(t).catch((e) => console.error("review reminder email failed", e));
    return Response.json({ reminded: targets.length });
  } catch (e) {
    console.error("cron review-reminder failed", e);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}

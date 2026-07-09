import { getCurrentUser } from "@/data/users/require-user";
import { AccountDAL } from "@/data/account/account.dal";
import { checkRateLimit } from "@/trpc/rate-limit";

export async function GET() {
  const u = await getCurrentUser();
  if (!u) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    checkRateLimit("account.export", u.id, 5, 3_600_000);
  } catch {
    return Response.json({ error: "TOO_MANY_REQUESTS" }, { status: 429 });
  }
  const data = await AccountDAL.exportData(u.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="event-review-data-${u.id}.json"`,
    },
  });
}

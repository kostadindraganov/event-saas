import { timingSafeEqual } from "node:crypto";

// Bearer guard за вътрешните cron endpoints (ADR 0003). Fail-closed без CRON_SECRET;
// constant-time сравнение — не издава дължина/префикс на секрета през timing.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

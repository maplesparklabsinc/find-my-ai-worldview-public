// GET /api/health (issue #59): for an outside uptime monitor. Not behind
// either password (proxy.ts), and rate-limited to 30 a minute per client.
import { tooMany, overLimit } from "@/lib/api";
import { healthReply } from "@/lib/api/health";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const wait = overLimit(req, "health", 30, Date.now(), 60_000);
  if (wait !== null) return tooMany(wait);
  return healthReply(() => db()`select 1`);
}

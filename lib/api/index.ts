// Shared plumbing for the write routes: body size limit, JSON parsing, a simple
// per-IP rate limit and error responses. The IP is used only as a key in an
// in-memory counter and is never stored or logged (CLAUDE.md non-negotiable 3).
import "server-only";
import { NextResponse } from "next/server";
import { getEditTokenHash } from "@/lib/db";
import { EDIT_TOKEN_HEADER, editTokenMatches } from "@/lib/edit-token";
import { MAX_BODY_BYTES, type SaveRefusal } from "@/lib/submit";

/** An error response. `reason` tells the browser what the person can do about it (lib/submit SaveRefusal). */
export function error(status: number, message: string, reason?: SaveRefusal, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(reason ? { error: message, reason } : { error: message }, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

/** 429 with Retry-After, in seconds. */
export function tooMany(retryAfter: number): NextResponse {
  return error(429, "too many requests", "rate_limited", { "retry-after": String(retryAfter) });
}

/** Read a JSON body no larger than MAX_BODY_BYTES. */
export async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return { ok: false, response: error(413, "payload too large") };
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { ok: false, response: error(413, "payload too large") };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: error(400, "invalid JSON") };
  }
}

// Fixed-window counters per route and client. Held in memory, so the limit is
// per server instance: enough to stop a casual script, not a determined one.
const windows = new Map<string, { start: number; count: number }>();
const WINDOW_MS = 10 * 60_000;

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Null while this client is within `limit` requests to `route` in the current
 * 10-minute window; once over it, the seconds until the window resets.
 */
export function overLimit(req: Request, route: string, limit: number, now = Date.now()): number | null {
  const key = `${route}|${clientKey(req)}`;
  const w = windows.get(key);
  if (!w || now - w.start >= WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start >= WINDOW_MS) windows.delete(k);
    }
    return null;
  }
  w.count += 1;
  return w.count > limit ? Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000)) : null;
}

/**
 * True when the request carries the edit token of response `id`, and that
 * response exists and is still inside its edit window. Callers answer 404
 * otherwise, so a wrong token looks the same as a missing result.
 */
export async function hasEditToken(req: Request, id: string): Promise<boolean> {
  const hash = await getEditTokenHash(id);
  return editTokenMatches(req.headers.get(EDIT_TOKEN_HEADER), hash);
}

// GET /api/health (issue #59): is the database answering? The reply is only
// {"status":"ok"} or {"status":"down"}: no error text, versions, hosts or
// timings, since anyone can call it.
export const HEALTH_TIMEOUT_MS = 3_000;

/** 200 ok if `ping` resolves within `timeoutMs`, else 503 down. */
export async function healthReply(ping: () => Promise<unknown>, timeoutMs = HEALTH_TIMEOUT_MS): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  let up = false;
  try {
    await Promise.race([Promise.resolve().then(ping), timeout]);
    up = true;
  } catch {
    up = false;
  } finally {
    clearTimeout(timer);
  }
  return Response.json({ status: up ? "ok" : "down" }, { status: up ? 200 : 503, headers: { "cache-control": "no-store" } });
}

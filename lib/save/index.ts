// Retrying writes from the browser (issue #59). Every save goes through
// saveWithRetry: network errors and 5xx are tried 3 times in all, a 429 once
// more after a short Retry-After, and any other 4xx never (it's a refusal the
// person can't fix by waiting). A save that only worked on a retry sends
// save_retried; one that failed every attempt sends save_failed. Both carry
// the step and reason only, never ids or answers. Safe in the browser.
import { track as analyticsTrack } from "@/lib/analytics";

export type SaveStep = "response" | "rating" | "research" | "feedback";
export type SaveFailure = "network" | "server" | "rate_limited";

export const RETRY = {
  /** Attempts in all for network errors and 5xx. */
  attempts: 3,
  /** Wait before the 2nd and 3rd attempts. */
  delaysMs: [500, 1_500],
  /** Up to this much random wait is added to each delay. */
  jitterMs: 250,
  /** A 429 is retried once, only if Retry-After asks for this many seconds or fewer. */
  maxRetryAfterS: 10,
} as const;

export interface SaveDeps {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  track: (name: "save_failed" | "save_retried", props: { step: SaveStep; reason: SaveFailure }) => void;
  now: () => number;
}

const defaults: SaveDeps = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: Math.random,
  track: (name, props) => analyticsTrack(name, props),
  now: Date.now,
};

/**
 * `res` is the last reply (null if the last attempt never got one).
 * `failure` is set only when every allowed attempt failed; a 4xx refusal
 * other than 429 comes back as `res` with no failure.
 */
export interface SaveOutcome {
  res: Response | null;
  failure: SaveFailure | null;
}

/** Retry-After in seconds (a number or an HTTP date), or null if missing or unreadable. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | null {
  if (header === null || header.trim() === "") return null;
  const n = Number(header);
  if (Number.isFinite(n)) return n >= 0 ? n : null;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, (at - now) / 1000);
}

export async function saveWithRetry(send: () => Promise<Response>, step: SaveStep, deps: Partial<SaveDeps> = {}): Promise<SaveOutcome> {
  const d = { ...defaults, ...deps };
  let tries = 0;
  let rateRetried = false;
  let last: SaveFailure | null = null;
  let res: Response | null = null;
  for (;;) {
    tries += 1;
    try {
      res = await send();
    } catch {
      res = null;
    }
    if (res?.ok) {
      if (last) d.track("save_retried", { step, reason: last });
      return { res, failure: null };
    }
    if (res?.status === 429) {
      last = "rate_limited";
      const wait = retryAfterSeconds(res.headers.get("retry-after"), d.now());
      if (rateRetried || wait === null || wait > RETRY.maxRetryAfterS) break;
      rateRetried = true;
      await d.sleep(wait * 1000);
      continue;
    }
    if (res && res.status < 500) return { res, failure: null };
    last = res ? "server" : "network";
    if (tries >= RETRY.attempts) break;
    await d.sleep(RETRY.delaysMs[Math.min(tries, RETRY.delaysMs.length) - 1] + d.random() * RETRY.jitterMs);
  }
  d.track("save_failed", { step, reason: last });
  return { res, failure: last };
}

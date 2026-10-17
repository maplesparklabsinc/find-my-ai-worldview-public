// The retry rules for browser saves (issue #59).
import { describe, expect, it, vi } from "vitest";
import { RETRY, retryAfterSeconds, saveWithRetry, type SaveDeps } from "@/lib/save";

vi.mock("@vercel/analytics", () => ({ track: () => {} }));

const reply = (status: number, headers: Record<string, string> = {}) => new Response(status === 204 ? null : "{}", { status, headers });

/** Replies in order; an Error stands for a network failure. */
function server(...replies: (number | Error | Response)[]) {
  let i = 0;
  const send = vi.fn(async () => {
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === "number" ? reply(r) : r;
  });
  return send;
}

function deps() {
  const waits: number[] = [];
  const events: [string, unknown][] = [];
  const d: Partial<SaveDeps> = {
    sleep: async (ms) => void waits.push(ms),
    random: () => 0.5,
    track: (name, props) => void events.push([name, props]),
    now: () => 0,
  };
  return { d, waits, events };
}

describe("saveWithRetry", () => {
  it("sends once when the first attempt works, with no event", async () => {
    const send = server(201);
    const { d, waits, events } = deps();
    const out = await saveWithRetry(send, "response", d);
    expect(out.res?.status).toBe(201);
    expect(out.failure).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
    expect(events).toEqual([]);
  });

  it("retries network errors and 5xx, 3 attempts in all, with backoff and jitter", async () => {
    const send = server(new TypeError("offline"), 503, 201);
    const { d, waits, events } = deps();
    const out = await saveWithRetry(send, "rating", d);
    expect(out.res?.status).toBe(201);
    expect(send).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([RETRY.delaysMs[0] + 0.5 * RETRY.jitterMs, RETRY.delaysMs[1] + 0.5 * RETRY.jitterMs]);
    expect(events).toEqual([["save_retried", { step: "rating", reason: "server" }]]);
  });

  it("gives up after 3 attempts and sends save_failed with the last reason", async () => {
    const send = server(500, 502, new TypeError("offline"), 201);
    const { d, events } = deps();
    const out = await saveWithRetry(send, "feedback", d);
    expect(send).toHaveBeenCalledTimes(3);
    expect(out.res).toBeNull();
    expect(out.failure).toBe("network");
    expect(events).toEqual([["save_failed", { step: "feedback", reason: "network" }]]);
  });

  it("never retries another 4xx, and counts it as a refusal, not a failure", async () => {
    for (const status of [400, 403, 404, 409, 413]) {
      const send = server(status, 201);
      const { d, events } = deps();
      const out = await saveWithRetry(send, "response", d);
      expect(send).toHaveBeenCalledTimes(1);
      expect(out.res?.status).toBe(status);
      expect(out.failure).toBeNull();
      expect(events).toEqual([]);
    }
  });

  it("retries a 429 once after a Retry-After of 10 seconds or less", async () => {
    const send = server(reply(429, { "retry-after": "3" }), 204);
    const { d, waits, events } = deps();
    const out = await saveWithRetry(send, "research", d);
    expect(out.res?.status).toBe(204);
    expect(waits).toEqual([3000]);
    expect(events).toEqual([["save_retried", { step: "research", reason: "rate_limited" }]]);
  });

  it("stops on a 429 with no Retry-After, a longer one, or a second 429", async () => {
    for (const replies of [[reply(429)], [reply(429, { "retry-after": "540" })], [reply(429, { "retry-after": "1" }), reply(429, { "retry-after": "1" })]]) {
      const send = server(...replies, 201);
      const { d, events } = deps();
      const out = await saveWithRetry(send, "response", d);
      expect(send).toHaveBeenCalledTimes(replies.length);
      expect(out.res?.status).toBe(429);
      expect(out.failure).toBe("rate_limited");
      expect(events).toEqual([["save_failed", { step: "response", reason: "rate_limited" }]]);
    }
  });

  it("sends only the step and reason, never anything about the person", async () => {
    const { d, events } = deps();
    await saveWithRetry(server(500), "response", d);
    for (const [, props] of events) expect(Object.keys(props as object).sort()).toEqual(["reason", "step"]);
  });
});

describe("retryAfterSeconds", () => {
  it("reads seconds or an HTTP date", () => {
    expect(retryAfterSeconds("5")).toBe(5);
    expect(retryAfterSeconds(new Date(10_000).toUTCString(), 4_000)).toBe(6);
    expect(retryAfterSeconds(null)).toBeNull();
    expect(retryAfterSeconds("soon")).toBeNull();
    expect(retryAfterSeconds("-1")).toBeNull();
  });
});

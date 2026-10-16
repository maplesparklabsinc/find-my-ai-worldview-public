// The write routes' rate limit (lib/api) and its Retry-After (issue #18).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getEditTokenHash: async () => null }));

const { overLimit, tooMany } = await import("@/lib/api");

const req = (ip: string) => new Request("http://x/api", { headers: { "x-forwarded-for": ip } });

describe("overLimit", () => {
  it("allows up to the limit, then gives the seconds until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(overLimit(req("1.1.1.1"), "t", 3, t0 + i)).toBeNull();
    expect(overLimit(req("1.1.1.1"), "t", 3, t0 + 60_000)).toBe(540);
    // Another client and another route have their own counts.
    expect(overLimit(req("2.2.2.2"), "t", 3, t0 + 60_000)).toBeNull();
    expect(overLimit(req("1.1.1.1"), "u", 3, t0 + 60_000)).toBeNull();
    // A new window starts after ten minutes.
    expect(overLimit(req("1.1.1.1"), "t", 3, t0 + 600_000)).toBeNull();
  });

  it("answers 429 with Retry-After and the rate_limited reason", async () => {
    const res = tooMany(540);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("540");
    expect(await res.json()).toEqual({ error: "too many requests", reason: "rate_limited" });
  });
});

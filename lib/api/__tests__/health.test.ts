// The health check's reply (issue #59): ok or down, and nothing else.
import { describe, expect, it } from "vitest";
import { healthReply } from "@/lib/api/health";

async function check(res: Response, status: number, body: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.text()).toBe(body);
}

describe("healthReply", () => {
  it("is 200 ok when the database answers", async () => {
    await check(await healthReply(async () => [{ "?column?": 1 }]), 200, '{"status":"ok"}');
  });

  it("is 503 down when the query fails, and the error never shows", async () => {
    const res = await healthReply(async () => {
      throw new Error("connect ECONNREFUSED db.internal.example:5432 password authentication failed");
    });
    await check(res, 503, '{"status":"down"}');
  });

  it("is 503 down when the database takes longer than the timeout", async () => {
    const res = await healthReply(() => new Promise((r) => setTimeout(r, 200)), 20);
    await check(res, 503, '{"status":"down"}');
  });

  it("is 503 down when the call throws before it starts", async () => {
    const res = await healthReply(() => {
      throw new Error("DATABASE_URL is not set");
    });
    await check(res, 503, '{"status":"down"}');
  });
});

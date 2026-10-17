// The load test never reaches anything but this computer (issue #59).
import { describe, expect, it } from "vitest";
import { notLocalTarget } from "../local-db.mjs";

describe("notLocalTarget", () => {
  it("allows localhost and 127.0.0.1 on any port", () => {
    expect(notLocalTarget("http://127.0.0.1:3000")).toBeNull();
    expect(notLocalTarget("http://localhost:3200/")).toBeNull();
  });

  it("refuses every other host, including look-alikes", () => {
    for (const t of [
      "https://findmyaiworldview.maplesparklabs.com",
      "https://find-my-ai-worldview.vercel.app",
      "http://192.168.1.20:3000",
      "http://localhost.example.com",
      "http://127.0.0.1.example.com",
      "not a url",
    ]) {
      expect(notLocalTarget(t)).not.toBeNull();
    }
  });
});

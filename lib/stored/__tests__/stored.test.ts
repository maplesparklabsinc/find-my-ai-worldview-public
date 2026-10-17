import { describe, expect, it, vi } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { loadReleaseByKey } from "@/lib/content/release";
import type { StoredResponse } from "@/lib/db";
import { score, type Answers } from "@/lib/scoring";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getResponse: async () => null }));
const { shown } = await import("@/lib/stored");

// Issue #80: item bank 0.9.0 reordered D11's options. A result saved under 0.8.0 keeps its own labels.
describe("a result saved under item bank 0.8.0", () => {
  it("renders under its own release, with the earlier-version banner, and Australia (option 3 then) still gets the Australian figures", async () => {
    const key = "0.4.0-0.3.1-0.8.0-0.7.0";
    const old = (await loadReleaseByKey(key))!;
    const answers = { ...(vectors.score_cases.find((v) => v.id === "precautionist")!.answers as Answers), D11: 3 };
    const [scoring, taxonomy, item_bank, narratives] = key.split("-");
    const row: StoredResponse = {
      id: "abcdefghijklmn",
      completed_on: new Date("2026-10-16"),
      scoring_version: scoring,
      taxonomy_version: taxonomy,
      item_bank_version: item_bank,
      narratives_version: narratives,
      answers,
      result: score(old.content, answers),
      compared_with: null,
    };
    const s = await shown(row);
    expect(s.release?.key).toBe(key);
    expect(s.outdated).toBe(true);
    expect(s.view).not.toBeNull();
    // Every card for a country the person lives in is marked as theirs, not "from another country".
    for (const b of s.view!.baseRates) expect(b.fromOtherCountry).toBe(b.country !== "AU");
  });
});

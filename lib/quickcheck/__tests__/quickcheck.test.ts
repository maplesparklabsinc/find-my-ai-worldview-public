import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { quickCheckPlan } from "@/lib/quickcheck";
import { score, type Answers } from "@/lib/scoring";

const c = getContent();
const result = score(c, vectors.score_cases[0].answers as Answers);
const shares = { show: 0.25, own: 0.5 };

describe("quickCheckPlan", () => {
  it("is the same for the same seed", () => {
    for (let s = 0; s < 50; s++) expect(quickCheckPlan(c, s, result, shares)).toEqual(quickCheckPlan(c, s, result, shares));
  });

  it("shows about 1 in 4 people, half their own perspective, others a different one", () => {
    const plans = Array.from({ length: 20000 }, (_, s) => quickCheckPlan(c, s * 7919, result, shares));
    const shown = plans.filter((p) => p !== null);
    expect(shown.length / plans.length).toBeGreaterThan(0.23);
    expect(shown.length / plans.length).toBeLessThan(0.27);
    const own = shown.filter((p) => p.shown === "own");
    expect(own.length / shown.length).toBeGreaterThan(0.46);
    expect(own.length / shown.length).toBeLessThan(0.54);
    const closest = result.outcome.ranked[0].id;
    expect(own.every((p) => p.perspective === closest)).toBe(true);
    const other = shown.filter((p) => p.shown === "other");
    expect(other.every((p) => p.perspective !== closest)).toBe(true);
    expect(new Set(other.map((p) => p.perspective)).size).toBe(c.perspectives.perspectives.length - 1);
  });

  it("is never shown without a closest perspective", () => {
    const empty = score(c, {});
    for (let s = 0; s < 200; s++) expect(quickCheckPlan(c, s, empty, { show: 1, own: 0.5 })).toBeNull();
  });
});

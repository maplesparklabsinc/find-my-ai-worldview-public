// Spec section 9: skipping never errors, scoring is deterministic.
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { mulberry32 } from "@/lib/form";
import { compare, pyRound, score, type Answers } from "@/lib/scoring";

const c = getContent();
const full = vectors.score_cases[0].answers as Answers;

describe("scoring", () => {
  it("handles no answers at all", () => {
    const r = score(c, {});
    expect(r.outcome).toEqual({ type: "undecided", reason: "coverage", ranked: [] });
    expect(r.tension).toBeNull();
    expect(Object.values(r.constructs).every((x) => x.score === null && x.answered === 0)).toBe(true);
    expect(compare(c, {}, {})).toEqual({
      gaps: { C1: null, C2: null, C3: null, C4: null, C5: null, C6: null },
      biggest_gap: null,
      agree: [],
      disagree: [],
    });
  });

  it("handles any subset of answers being skipped", () => {
    const rand = mulberry32(11);
    const keys = Object.keys(full);
    for (let n = 0; n < 500; n++) {
      const a: Answers = {};
      for (const k of keys) if (rand() < 0.6) a[k] = full[k];
      expect(() => score(c, a)).not.toThrow();
      expect(() => compare(c, a, full)).not.toThrow();
    }
  });

  it("ignores malformed values instead of throwing", () => {
    const a: Answers = { ...full, "C1-01": 2.5, D8: "x", D4: 3, "C3-T1": 1, "D3:C1": "?" };
    expect(() => score(c, a)).not.toThrow();
  });

  it("ignores CX-T1 (collected, not scored): the same result whatever is answered there, or if it's skipped", () => {
    for (const v of vectors.score_cases) {
      const base = { ...(v.answers as Answers) };
      delete base["CX-T1"];
      const skipped = score(c, base);
      for (const choice of [0, 1] as const) {
        for (const strength of ["slightly", "strongly"] as const) {
          expect(score(c, { ...base, "CX-T1": { choice, strength } })).toStrictEqual(skipped);
          expect(compare(c, { ...base, "CX-T1": { choice, strength } }, full)).toStrictEqual(compare(c, base, full));
        }
      }
    }
  });

  it("is deterministic", () => {
    for (const v of vectors.score_cases) {
      expect(score(c, v.answers as Answers)).toStrictEqual(score(c, structuredClone(v.answers) as Answers));
    }
  });
});

describe("pyRound matches Python round()", () => {
  it.each([
    [0.03125, 4, 0.0312],
    [-0.03125, 4, -0.0312],
    [0.09375, 4, 0.0938],
    [2.5, 0, 2],
    [3.5, 0, 4],
    [1.23456789, 4, 1.2346],
    [2.675, 2, 2.67], // 2.675 is stored just below the tie
    [1 / 3, 4, 0.3333],
    [-2 / 3, 4, -0.6667],
    [1e20, 4, 1e20],
    [0, 4, 0],
  ])("round(%d, %d) == %d", (x, n, want) => {
    expect(pyRound(x, n)).toBe(want);
  });
});

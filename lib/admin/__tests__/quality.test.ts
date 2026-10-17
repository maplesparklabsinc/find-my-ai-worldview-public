// Issue #55, section 2: the response-quality flags.
import { describe, expect, it } from "vitest";
import { getContent } from "@/lib/content";
import { QUALITY, duration, flagsLabel, median, parseCheckFilter, quality, releaseMedianMs, statementKeys } from "@/lib/admin/quality";

const c = getContent();
const statements = statementKeys(c);
const answerAll = (v: (i: number) => number) => Object.fromEntries(statements.map((k, i) => [k, v(i)]));
const timeAll = (ms: number) => Object.fromEntries(statements.map((k) => [k, ms]));

describe("quality flags", () => {
  it("uses the 30 scored statements of the form", () => {
    expect(statements).toHaveLength(30);
    expect(statements).toContain("C1-01");
    expect(statements).not.toContain("S1");
  });

  it("median handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("too fast: a median under 2 seconds a statement, at any size of release", () => {
    const fast = quality(statements, { answers: answerAll((i) => (i % 7) + 1), timings_ms: timeAll(1_900) }, null);
    expect(fast.flags).toEqual(["too_fast"]);
    expect(fast.medianStatementMs).toBe(1_900);
    const ok = quality(statements, { answers: answerAll((i) => (i % 7) + 1), timings_ms: timeAll(QUALITY.minMedianStatementMs) }, null);
    expect(ok.flags).toEqual([]);
  });

  it("too fast: under a third of the release's median, only once the release has 30 responses", () => {
    const r = { answers: answerAll((i) => (i % 7) + 1), timings_ms: { ...timeAll(3_000), S1: 0 } };
    // 30 x 3 s = 90 s in all.
    expect(quality(statements, r, 300_000).flags).toEqual(["too_fast"]);
    expect(quality(statements, r, 270_000).flags).toEqual([]);
    expect(releaseMedianMs(Array(29).fill(300_000))).toBeNull();
    expect(releaseMedianMs(Array(30).fill(300_000))).toBe(300_000);
  });

  it("same answer: 90% or more of the answered statements the same", () => {
    const nine = quality(statements, { answers: answerAll((i) => (i < 27 ? 4 : 5)), timings_ms: timeAll(5_000) }, null);
    expect(nine.flags).toEqual(["same_answer"]);
    const less = quality(statements, { answers: answerAll((i) => (i < 26 ? 4 : 5)), timings_ms: timeAll(5_000) }, null);
    expect(less.flags).toEqual([]);
    // Skipped statements don't count either way.
    const few = quality(statements, { answers: { "C1-01": 6, "C1-02": 6 }, timings_ms: timeAll(5_000) }, null);
    expect(few.flags).toEqual(["same_answer"]);
    expect(quality(statements, { answers: {}, timings_ms: {} }, null).flags).toEqual([]);
  });

  it("both flags, labels and the filter", () => {
    const both = quality(statements, { answers: answerAll(() => 7), timings_ms: timeAll(500) }, null);
    expect(flagsLabel(both.flags)).toBe("Too fast, Same answer");
    expect(flagsLabel([])).toBe("");
    expect(["flagged", "clean", "x", undefined].map(parseCheckFilter)).toEqual(["flagged", "clean", null, null]);
    expect([duration(48_000), duration(252_000)]).toEqual(["48 s", "4 min 12 s"]);
  });
});

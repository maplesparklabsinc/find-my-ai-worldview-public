// Every case in reference/test-vectors.json must match exactly (docs/02-scoring-spec.md section 9).
// Never special-case a vector here: fix the scorer or raise the discrepancy.
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { contentVersions, getContent } from "@/lib/content";
import { compare, score, type Answers } from "@/lib/scoring";

const c = getContent();

describe("reference/test-vectors.json", () => {
  it("was generated from the current content versions", () => {
    expect(vectors.versions).toEqual(contentVersions(c));
  });

  it("has cases to check", () => {
    expect(vectors.score_cases.length).toBeGreaterThan(0);
    expect(vectors.compare_cases.length).toBeGreaterThan(0);
  });

  describe("score_cases", () => {
    it.each(vectors.score_cases.map((v) => [v.id, v] as const))("%s", (_id, v) => {
      expect(score(c, v.answers as Answers)).toStrictEqual(v.expected);
    });
  });

  describe("compare_cases", () => {
    it.each(vectors.compare_cases.map((v) => [v.id, v] as const))("%s", (_id, v) => {
      expect(compare(c, v.a as Answers, v.b as Answers)).toStrictEqual(v.expected);
    });
  });
});

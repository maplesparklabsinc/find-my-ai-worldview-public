// The "still forming" note and the no-difference comparison (issue #18).
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { compareView, resultView } from "@/lib/results";
import { compare, score, type Answers } from "@/lib/scoring";

const c = getContent();
const copy = getCopy();
const answersOf = (id: string) => vectors.score_cases.find((v) => v.id === id)!.answers as Answers;

describe("unsettled note", () => {
  it("shows for someone unsure who answered strongly, and not otherwise", () => {
    const strong = resultView(c, copy, score(c, answersOf("unsettled_but_strong")), answersOf("unsettled_but_strong"));
    expect(strong.outcome).toBe("matched");
    expect(strong.unsettledNote).toBe(c.narratives.unsettled_note);
    for (const id of ["accelerator", "undecided_confidence", "mixed_between"]) {
      expect(resultView(c, copy, score(c, answersOf(id)), answersOf(id)).unsettledNote, id).toBeNull();
    }
  });

  it("is absent for results saved before the flag existed", () => {
    const r = score(c, answersOf("unsettled_but_strong"));
    const old = { ...r, outcome: { type: r.outcome.type, ranked: r.outcome.ranked } } as typeof r;
    expect(resultView(c, copy, old, answersOf("unsettled_but_strong")).unsettledNote).toBeNull();
  });
});

describe("comparison with no difference", () => {
  it("has no biggest gap and says they land in the same place", () => {
    const a = answersOf("accelerator");
    const v = compareView(c, compare(c, a, a), score(c, a), score(c, a));
    expect(v.biggestGap).toBeNull();
    expect(v.noDifference).toBe(true);
  });

  it("still names the biggest gap when there is one, and isn't a no-difference when nothing compares", () => {
    const a = answersOf("accelerator");
    const b = answersOf("precautionist");
    expect(compareView(c, compare(c, a, b), score(c, a), score(c, b)).noDifference).toBe(false);
    const empty: Answers = {};
    expect(compareView(c, compare(c, a, empty), score(c, a), score(c, empty)).noDifference).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { compare, score, type Answers } from "@/lib/scoring";
import { compareView, countryOf, overlapLine, pickBaseRates, render, resultView, type ResultView, type TrackView } from "@/lib/results";

const c = getContent();
const copy = getCopy();
const cases = vectors.score_cases.map((v) => ({ id: v.id, answers: v.answers as Answers, result: score(c, v.answers as Answers) }));

/** Every string the person sees about themselves (not base rates, which carry their own figures). */
function personStrings(v: ResultView): string[] {
  return [
    v.headline,
    v.subhead ?? "",
    v.tension?.text ?? "",
    ...v.tracks.flatMap((t) => [t.bandText, t.description]),
    ...v.statements.commonGround,
    v.statements.difference ?? "",
    v.statements.unexpected ?? "",
    v.whyThisResult,
  ];
}

describe("resultView", () => {
  it.each(cases.map((x) => [x.id, x] as const))("%s renders every string with no unfilled template", (_id, x) => {
    const v = resultView(c, copy, x.result, x.answers);
    for (const s of personStrings(v)) expect(s).not.toMatch(/[{}]/);
    expect(v.outcome).toBe(x.result.outcome.type);
  });

  it("never shows scores, distances or percentages about the person", () => {
    for (const x of cases) {
      const v = resultView(c, copy, x.result, x.answers);
      // Answer counts ("5 of 5 answered") and the statement count are allowed; nothing else numeric.
      // Outcome body copy is fixed content (it may cite a dated poll), so it is left out here.
      const strings = personStrings({ ...v, subhead: null }).map((s) => s.replace(/\(\d+ of \d+ answered\)/, "").replace(/answers to \d+ statements/, ""));
      for (const s of strings) expect(s).not.toMatch(/\d|%/);
    }
  });

  it("uses the matched headline and names the closest perspective", () => {
    const x = cases.find((k) => k.id === "steward")!;
    const v = resultView(c, copy, x.result, x.answers);
    expect(v.headline).toBe("Your closest perspective: Stewards");
    expect(v.subhead).toContain("You are also near Pragmatists and Precautionists");
    expect(v.perspective?.id).toBe("stewards");
    expect(v.alsoNear.map((p) => p.id)).toEqual(["pragmatists", "precautionists"]);
    expect(v.between).toBeNull();
    expect(v.statements.commonGround[0]).toBe(
      `Like Stewards, you agree that ${c.itemsById.get("C4-02")!.short}.`,
    );
  });

  it("reaches Skeptics, with the names people use for it elsewhere (issue #39)", () => {
    const x = cases.find((k) => k.id === "skeptic")!;
    const v = resultView(c, copy, x.result, x.answers);
    expect(v.headline).toBe("Your closest perspective: Skeptics");
    expect(v.perspective?.elsewhere).toBe(c.perspectives.perspectives.find((p) => p.id === "skeptics")!.elsewhere);
    const y = cases.find((k) => k.id === "precautionist_not_skeptic")!;
    expect(resultView(c, copy, y.result, y.answers).perspective?.id).toBe("precautionists");
  });

  it("gives every outcome its own headline", () => {
    const heads = new Map(cases.map((x) => [x.id, resultView(c, copy, x.result, x.answers)]));
    expect(heads.get("mixed_between")!.headline).toMatch(/^You sit between .+ and .+$/);
    expect(heads.get("mixed_between")!.between).toHaveLength(2);
    expect(heads.get("mixed_unmatched")!.headline).toBe(c.narratives.outcomes.mixed_unmatched.headline);
    expect(heads.get("indifferent")!.headline).toBe(c.narratives.outcomes.indifferent.headline);
    expect(heads.get("undecided_confidence")!.subhead).toBe(c.narratives.outcomes.undecided.body);
    expect(heads.get("undecided_coverage")!.subhead).toBe(c.narratives.outcomes.undecided.coverage_body);
    for (const id of ["mixed_between", "mixed_unmatched", "indifferent", "undecided_confidence"]) {
      expect(heads.get(id)!.perspective).toBeNull();
      expect(heads.get(id)!.alsoNear).toEqual([]);
    }
  });

  it("uses the disagree templates when the shared view is a rejection", () => {
    const x = cases.find((k) => k.id === "accelerator")!;
    const r = structuredClone(x.result);
    r.statements.common_ground = [{ perspective: "accelerators", item: "C3-01", direction: "disagree" }];
    const v = resultView(c, copy, r, x.answers);
    expect(v.statements.commonGround[0]).toBe(`Like Accelerators, you don't think ${c.itemsById.get("C3-01")!.short}.`);
  });

  it("places markers between the ends and says when a question is unmeasured", () => {
    const x = cases.find((k) => k.id === "undecided_coverage")!;
    const v = resultView(c, copy, x.result, x.answers);
    const c3 = v.tracks.find((t) => t.construct === "C3")!;
    expect(c3.position).toBeNull();
    expect(c3.bandText).toBe("Not enough answers to place you here (0 of 5 answered).");
    const c1 = v.tracks.find((t) => t.construct === "C1")!;
    expect(c1.position).toBeCloseTo((x.result.constructs.C1.score! + 3) / 6);
    expect(c1.bandText).toBe('Strongly toward "Expects large benefits"');
    expect(c1.description).toBe('How much good will AI do? Strongly toward "Expects large benefits"');
  });
});

describe("base rates", () => {
  const x = cases.find((k) => k.id === "precautionist")!;

  it("map D11 to a country code", () => {
    expect(countryOf(c, copy, { D11: 0 })).toBe("CA");
    expect(countryOf(c, copy, { D11: 2 })).toBe("GB");
    expect(countryOf(c, copy, { D11: 4 })).toBeNull();
    expect(countryOf(c, copy, {})).toBeNull();
  });

  it("prefer the person's country and always carry their source", () => {
    const cards = pickBaseRates(c, copy, x.result, "CA");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(3);
    for (const card of cards) {
      expect(card.source && card.year && card.population && card.countryName).toBeTruthy();
      if (!card.fromOtherCountry) expect(card.country).toBe("CA");
      else expect(c.baseRates.items.some((r) => r.construct === card.construct && r.country === "CA")).toBe(false);
    }
    expect(new Set(cards.map((k) => k.construct)).size).toBe(cards.length);
  });

  it("fall back to another country, named, when there is no figure for theirs", () => {
    const cards = pickBaseRates(c, copy, x.result, "AU");
    const other = cards.filter((k) => k.fromOtherCountry);
    expect(other.length).toBeGreaterThan(0);
    for (const k of other) expect(k.countryName).not.toBe(k.country);
  });

  it("carry the similar-question flag from the source", () => {
    for (const country of ["CA", "US", "GB", "AU", null]) {
      for (const card of pickBaseRates(c, copy, x.result, country, 6)) {
        const src = c.baseRates.items.find((r) => r.text === card.text)!;
        expect(card.similarQuestion).toBe(src.similar_question ?? false);
        expect(card.approximate).toBe(src.approximate);
      }
    }
  });
});

describe("compareView", () => {
  it("renders agreements and splits from content templates", () => {
    const k = vectors.compare_cases[0];
    const a = score(c, k.a as Answers);
    const b = score(c, k.b as Answers);
    const v = compareView(c, compare(c, k.a as Answers, k.b as Answers), a, b);
    expect(v.biggestGap?.construct).toBe("C3");
    expect(v.tracks).toHaveLength(6);
    expect(v.agree[0]).toBe(`You both agree that ${c.itemsById.get("C1-01")!.short}.`);
    expect(v.disagree[0]).toMatch(/^You split on whether .+\. Ask each other: what would change your mind\?$/);
  });
});

describe("render", () => {
  it("fails loudly on a missing value", () => {
    expect(() => render("Hi {name}", {})).toThrow(/\{name\}/);
    expect(render("Hi {name}", { name: "Sam" })).toBe("Hi Sam");
  });
});

describe("outcome details", () => {
  const view = (id: string) => {
    const x = cases.find((k) => k.id === id)!;
    return resultView(c, copy, x.result, x.answers);
  };

  it("in between: a card per perspective, a shared view where there is one, and the question that might tip you", () => {
    const v = view("mixed_between");
    if (v.detail.type !== "mixed_between") throw new Error(v.detail.type);
    expect(v.detail.cards.map((k) => k.perspective.id)).toEqual(v.ranking.slice(0, 2).map((p) => p.id));
    for (const card of v.detail.cards) {
      if (card.shared) expect(card.shared).toMatch(new RegExp(`^Like ${card.perspective.name}, you (agree that|don't think) `));
    }
    const [a, b] = v.detail.cards.map((k) => c.perspectives.perspectives.find((p) => p.id === k.perspective.id)!);
    const gap = (k: string) => Math.abs(a.prototype[k] - b.prototype[k]);
    for (const k of c.config.scored_constructs) expect(gap(v.detail.tip.construct)).toBeGreaterThanOrEqual(gap(k));
    expect(v.detail.tip.question).toBe(c.narratives.constructs[v.detail.tip.construct].question);
  });

  it("own combination: what's distinctive and the two nearest", () => {
    const v = view("mixed_unmatched");
    if (v.detail.type !== "mixed_unmatched") throw new Error(v.detail.type);
    expect(v.detail.distinctive).toBe(v.tension!.text);
    expect(v.detail.nearest.map((p) => p.id)).toEqual(v.ranking.slice(0, 2).map((p) => p.id));
    expect(v.subheadSources).toEqual([]);
  });

  it("still forming: leanings, three prompts nearest first, and the poll's source line", () => {
    const v = view("undecided_confidence");
    if (v.detail.type !== "undecided") throw new Error(v.detail.type);
    expect(v.detail.prompts).toEqual(v.ranking.slice(0, 3).map((p) => p.discussionPrompt));
    for (const l of v.detail.leanings) expect(v.tracks.find((t) => t.construct === l.construct)!.band).not.toBe("between");
    expect(v.subheadSources).toEqual(["Leger, 2025 · 1,518 Canadian adults, online panel"]);
    expect(view("undecided_coverage").subheadSources).toEqual([]);
  });

  it("not a priority: its own section and source line", () => {
    const v = view("indifferent");
    expect(v.detail).toEqual({
      type: "indifferent",
      heading: c.narratives.outcomes.indifferent.section_heading,
      body: c.narratives.outcomes.indifferent.section_body,
    });
    expect(v.subheadSources[0]).toMatch(/^Kieslich, Lünich and Došenović, 2022 · /);
  });
});

describe("provisional note", () => {
  it("is on every outcome and links to What's changed", () => {
    for (const x of cases) {
      const v = resultView(c, copy, x.result, x.answers);
      expect(v.provisional).toBe(c.narratives.provisional);
      expect(v.provisional).toContain("](/changes)");
    }
  });
});

describe("own combination overlap line", () => {
  const c = getContent();
  const track = (construct: string, band: TrackView["band"]) => ({ construct, band }) as TrackView;

  it("names up to three perspectives on the questions that define them, each once", () => {
    // Fast release (Accelerators' defining question), public rules (Stewards'), shared gains (Shared-Gains Advocates').
    const line = overlapLine(c, [track("C3", "strong_low"), track("C4", "strong_high"), track("C6", "strong_high"), track("C1", "between")]);
    expect(line).toBe(
      "Your answers line up with Shared-Gains Advocates on who should share in the gains, Accelerators on how fast new AI should be released and Stewards on who sets the rules. None of the seven captures your mix completely.",
    );
  });

  it("is left out when fewer than two perspectives line up", () => {
    expect(overlapLine(c, [track("C3", "strong_low")])).toBeNull();
    expect(overlapLine(c, [])).toBeNull();
  });
});

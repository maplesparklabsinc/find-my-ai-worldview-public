// Issue #55: the cards built from single responses.
import { describe, expect, it } from "vitest";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { standardSequence } from "@/lib/form";
import {
  alsoBetweenWith,
  HEALTH_FIRST_ROWS,
  worstBothAgree,
  betweenPairs,
  clarityWords,
  closeness,
  fitRows,
  flaggedTile,
  location,
  pairKey,
  parseHealthSort,
  qualityByRow,
  questionHealth,
  runnerUpBands,
  setupCheck,
  sharing,
  sortHealth,
  themeSpread,
  type AdminRow,
} from "@/lib/admin/insights";

const c = getContent();
const copy = getCopy();

let n = 0;
function row(over: Partial<AdminRow> = {}): AdminRow {
  n++;
  return {
    id: `r${String(n).padStart(13, "0")}`,
    completed_on: "2026-10-16",
    form: c.config.form,
    seed: n,
    answer_direction: standardSequence(c, n).direction,
    answers: {},
    timings_ms: {},
    answer_changes: {},
    outcome_type: "matched",
    ranked: [
      { id: "stewards", distance: 0.5 },
      { id: "pragmatists", distance: 1.2 },
    ],
    bands: {},
    fit_rating: null,
    better_fit: null,
    quick_check_shown: null,
    prediction_kind: null,
    prediction_perspectives: null,
    outcome_reason: null,
    ...over,
  };
}

const between = (a: string, b: string, gap = 0.1): Partial<AdminRow> => ({
  outcome_type: "mixed_between",
  ranked: [
    { id: a, distance: 0.6 },
    { id: b, distance: 0.6 + gap },
  ],
});

describe("theme spread", () => {
  it("counts people per band, low end to high end, with labels from content and no averages", () => {
    const rows = [row({ bands: { C1: "strong_low" } }), row({ bands: { C1: "strong_low" } }), row({ bands: { C1: "lean_high" } }), row({ bands: { C1: null } })];
    const t = themeSpread(c, rows).find((x) => x.construct === "C1")!;
    expect(t.bands.map((b) => b.band)).toEqual(["strong_low", "lean_low", "between", "lean_high", "strong_high"]);
    expect(t.bands.map((b) => b.n)).toEqual([2, 0, 0, 1, 0]);
    expect(t.n).toBe(3);
    expect(t.notPlaced).toBe(1);
    expect(t.few).toBe(true);
    expect(t.low).toBe(c.narratives.constructs.C1.low);
    expect(t.bands[0].label).toContain(c.narratives.constructs.C1.low);
    expect(t.summary).toContain("3 people placed");
    expect(JSON.stringify(t)).not.toMatch(/score|mean|average/i);
  });
});

describe("question health", () => {
  it("spread, skip and changed rates, one-side share", () => {
    const rows = [
      row({ answers: { "C1-01": 7, "C1-05": 6 }, answer_changes: { "C1-01": 2 } }),
      row({ answers: { "C1-01": 6, "C1-05": 2 } }),
      row({ answers: { "C1-01": 1 } }),
      row({ answers: {} }),
    ];
    const { statements } = questionHealth(c, rows);
    expect(statements).toHaveLength(30);
    const s = statements.find((x) => x.item === "C1-01")!;
    expect(s.spread).toEqual([1, 0, 0, 0, 0, 1, 1]);
    expect(s.answered).toBe(3);
    expect(s.skipRate).toBe(0.25);
    expect(s.changedRate).toBe(0.25);
    expect(s.oneSide).toBeCloseTo(2 / 3);
    // Flags are hidden below 30.
    expect(s.oneSideFlag).toBe(false);
  });

  it("flags more than 80% on one side once 30 have answered", () => {
    const rows = [...Array.from({ length: 25 }, () => row({ answers: { "C2-01": 6 } })), ...Array.from({ length: 5 }, () => row({ answers: { "C2-01": 4 } }))];
    const s = questionHealth(c, rows).statements.find((x) => x.item === "C2-01")!;
    expect(s.oneSide).toBeCloseTo(25 / 30);
    expect(s.oneSideFlag).toBe(true);
    const at80 = [...Array.from({ length: 24 }, () => row({ answers: { "C2-01": 6 } })), ...Array.from({ length: 6 }, () => row({ answers: { "C2-01": 2 } }))];
    expect(questionHealth(c, at80).statements.find((x) => x.item === "C2-01")!.oneSideFlag).toBe(false);
  });

  it("agree with both: only opposite-direction pairs on the same theme, share of those who answered both", () => {
    // C1-01 is "+", C1-05 is "-".
    const rows = [
      row({ answers: { "C1-01": 6, "C1-05": 5 } }),
      row({ answers: { "C1-01": 7, "C1-05": 2 } }),
      row({ answers: { "C1-01": 5, "C1-05": 6 } }),
      row({ answers: { "C1-01": 5 } }),
    ];
    const { pairs } = questionHealth(c, rows);
    for (const p of pairs) {
      expect(c.itemsById.get(p.a)!.pole).toBe("+");
      expect(c.itemsById.get(p.b)!.pole).toBe("-");
      expect(c.itemsById.get(p.a)!.construct).toBe(c.itemsById.get(p.b)!.construct);
    }
    // Five statements a theme, three one way and two the other: 6 pairs a theme.
    expect(pairs).toHaveLength(36);
    expect(pairs[0]).toMatchObject({ a: "C1-01", b: "C1-05", n: 3 });
    expect(pairs[0].share).toBeCloseTo(2 / 3);
  });

  it("opens on most on one side, then most skipped; sorts by any column, the item column in form order", () => {
    const rows = [row({ answers: { "C6-06": 6, "C2-01": 4 } }), row({ answers: { "C6-06": 6, "C1-01": 2, "C2-01": 6 } })];
    const s = questionHealth(c, rows).statements;
    expect(parseHealthSort(undefined)).toBe("side");
    expect(["skip", "item", "nope"].map(parseHealthSort)).toEqual(["skip", "item", "side"]);
    // C6-06 and C1-01 are both 100% on one side; C1-01 was skipped more, so it comes first.
    expect(sortHealth(s, "side").slice(0, 2).map((x) => x.item)).toEqual(["C1-01", "C6-06"]);
    expect(sortHealth(s, "item")[0].item).toBe(s[0].item);
    expect(sortHealth(s, "answered").slice(0, 2).map((x) => x.item)).toEqual(["C2-01", "C6-06"]);
    expect(sortHealth(s, "skip").at(-1)!.item).toBe("C6-06");
    expect(HEALTH_FIRST_ROWS).toBe(10);
  });

  it("lists agree-with-both pairs only when the top one is above 0%", () => {
    const none = questionHealth(c, [row({ answers: { "C1-01": 6, "C1-05": 2 } }), row({ answers: { "C1-01": 2, "C1-05": 6 } })]).pairs;
    expect(worstBothAgree(none)).toEqual([]);
    const some = questionHealth(c, [row({ answers: { "C1-01": 6, "C1-05": 6 } }), row({ answers: { "C1-01": 2, "C1-05": 6 } })]).pairs;
    // Only pairs someone answered both of are listed.
    expect(worstBothAgree(some).map((p) => [p.a, p.b, p.share])).toEqual([["C1-01", "C1-05", 0.5]]);
  });

  it("agree-with-both pairs carry both statements' short text", () => {
    const { pairs } = questionHealth(c, [row({ answers: { "C1-01": 6, "C1-05": 6 } })]);
    const p = pairs.find((x) => x.a === "C1-01" && x.b === "C1-05")!;
    expect(p.aText).toBe(c.itemsById.get("C1-01")!.short);
    expect(p.bText).toBe(c.itemsById.get("C1-05")!.short);
  });
});

describe("runner-up gap", () => {
  it("very close inside the tie margin, close inside twice it, clear beyond; never a number", () => {
    const t = runnerUpBands(c);
    expect(t.veryClose).toBe(c.config.match.tie_margin);
    const at = (gap: number) => closeness(c, [{ id: "a", distance: 0 }, { id: "b", distance: gap }]);
    expect(at(0.05)).toBe("very_close");
    expect(at(t.veryClose)).toBe("close");
    expect(at(t.close - 0.01)).toBe("close");
    expect(at(t.close)).toBe("clear");
    expect(closeness(c, [{ id: "a", distance: 1 }])).toBeNull();
  });
});

describe("how clear the result was", () => {
  it("names the most common of clear, close and very close; a tie goes to the less clear", () => {
    expect(clarityWords(["clear", "clear", "close"]).words).toBe("mostly clear");
    expect(clarityWords(["close", "close", "clear"]).words).toBe("often close");
    expect(clarityWords(["very_close", "clear"]).words).toBe("mostly very close");
    expect(clarityWords(["close", "clear"])).toEqual({ words: "often close", counts: "clear 1 · close 1 · very close 0" });
  });
});

describe("In between pairs (section 9)", () => {
  const rows = [
    row(between("stewards", "pragmatists")),
    row(between("pragmatists", "stewards")),
    row(between("stewards", "precautionists")),
    row(between("pragmatists", "stewards")),
    row(),
    row({ outcome_type: "mixed_unmatched" }),
  ];

  it("counts a pair the same whichever way round, most first, and the sub-rows add up to In between", () => {
    const pairs = betweenPairs(c, rows);
    expect(pairs.map((p) => [p.key, p.n])).toEqual([
      [pairKey("stewards", "pragmatists"), 3],
      [pairKey("stewards", "precautionists"), 1],
    ]);
    expect(pairs[0].label).toBe("Pragmatists and Stewards");
    expect(pairs.reduce((s, p) => s + p.n, 0)).toBe(rows.filter((r) => r.outcome_type === "mixed_between").length);
    expect(pairs[0].pct).toBe("75%");
    expect(pairs[0].few).toBe(true);
  });

  it("each perspective lists who it was in between with", () => {
    const also = alsoBetweenWith(c, rows);
    expect(also.get("stewards")).toBe("Pragmatists (3), Precautionists (1)");
    expect(also.get("pragmatists")).toBe("Stewards (3)");
    expect(also.get("accelerators")).toBe("");
  });

  it("the fit card breaks In between down by pair, and pair rows add up", () => {
    const rated = rows.map((r, i) => ({ ...r, fit_rating: (i % 5) + 1, better_fit: i === 0 ? "own_mix" : null }));
    const fit = fitRows(c, copy, rated);
    const inBetween = fit.find((f) => f.name === "In between")!;
    const subs = fit.filter((f) => f.sub);
    expect(subs.map((f) => f.name)).toEqual(["Pragmatists and Stewards", "Precautionists and Stewards"]);
    expect(subs.reduce((s, f) => s + f.people, 0)).toBe(inBetween.people);
    expect(inBetween.spread.reduce((s, x) => s + x, 0)).toBe(inBetween.n);
    expect(inBetween.picked).toBe(`${copy.fit.better_own_mix} (1)`);
    // In between and its pairs are very close by definition: no "how clear".
    expect(inBetween.clarity).toBeNull();
    expect(subs.every((f) => f.clarity === null)).toBe(true);
    const stewards = fit.find((f) => f.name === "Stewards")!;
    expect(stewards.clarity).toEqual({ words: "mostly clear", counts: "clear 1 · close 0 · very close 0" });
    expect(fit.map((f) => f.name)).toContain("Your own combination");
    // Own combination: nothing was close, so no "how clear".
    expect(fit.find((f) => f.name === "Your own combination")!.clarity).toBeNull();
    expect(JSON.stringify(fit)).not.toMatch(/distance|0\.\d{3}/);
  });
});

describe("research setup check (section 8)", () => {
  it("OK and Look, judged once there are 30", () => {
    const few = setupCheck(c, copy, [row(), row()]);
    expect(few.map((l) => l.ok)).toEqual([null, null, true, true]);

    const rows = Array.from({ length: 40 }, (_, i) =>
      row({ answer_direction: i < 20 ? "agree_first" : "disagree_first", quick_check_shown: i < 10 ? "own" : null, prediction_kind: i >= 10 ? "skipped" : null }),
    );
    const lines = setupCheck(c, copy, rows);
    expect(lines.map((l) => [l.value, l.ok])).toEqual([
      ["50%", true],
      ["25%", true],
      ["0", true],
      ["100%", true],
    ]);

    const off = setupCheck(c, copy, rows.map((r, i) => ({ ...r, answer_direction: i < 30 ? "agree_first" : r.answer_direction, prediction_kind: i === 0 ? "skipped" : r.prediction_kind })));
    expect(off[0].ok).toBe(false);
    expect(off[2]).toMatchObject({ value: "1", ok: false });
  });
});

describe("location, sharing and the flagged tile", () => {
  it("location: every D11 answer, then Not answered, with shares", () => {
    const rows = location(c, [
      { option: 0, all_time: 6, last_7_days: 2 },
      { option: 4, all_time: 2, last_7_days: 0 },
      { option: null, all_time: 2, last_7_days: 2 },
    ]);
    expect(rows.map((r) => r.label)).toEqual([...c.itemsById.get("D11")!.options, "Not answered"]);
    expect(rows[0]).toMatchObject({ allTime: 6, allPct: "60%", week: 2, weekPct: "50%" });
    expect(rows.at(-1)).toMatchObject({ allTime: 2, weekPct: "50%" });
  });

  it("sharing and the flagged tile", () => {
    expect(sharing({ total: 40, compared: 10, targets: 4, top: [{ id: "a", n: 7 }] })).toEqual({ compared: 10, comparedPct: "25%", targets: 4, top: [{ id: "a", n: 7 }] });
    const flags = qualityByRow(c, [row({ answers: { "C1-01": 4 }, timings_ms: { "C1-01": 500 } }), row()]);
    expect(flaggedTile(flags)).toEqual({ n: 1, pct: "50%" });
  });
});

// /admin/responses (issue #37): filters, list rows and the detail view.
// Issue #51: the Research column and filter, and "What they told us".
// Issue #55: the quality filter, the Check column and In between pairs.
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import {
  PAGE_SIZE,
  buildResponseDetail,
  answerChangesLine,
  buildResponseList,
  canonicalKeys,
  parsePage,
  parseResearchFilter,
  parseResultFilter,
  researchFollowUp,
  researchLabel,
  trackChecksLines,
  releaseVersions,
  resultFilterOptions,
  pageOfResponses,
  timingLine,
  type ListFilters,
  type ResponseDetailRaw,
  type ResponseListRaw,
} from "@/lib/admin/responses";
import { statementKeys } from "@/lib/admin/quality";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { standardSequence } from "@/lib/form";
import { score, type Answers } from "@/lib/scoring";

const c = getContent();
const copy = getCopy();

describe("filters", () => {
  it("parse a perspective, the other outcomes, and ignore anything else", () => {
    expect(parseResultFilter("stewards", c)).toEqual({ outcome_type: "matched", perspective: "stewards" });
    expect(parseResultFilter("between", c)).toEqual({ outcome_type: "mixed_between", perspective: null });
    expect(parseResultFilter("own_combination", c)).toEqual({ outcome_type: "mixed_unmatched", perspective: null });
    expect(parseResultFilter("forming", c)).toEqual({ outcome_type: "undecided", perspective: null });
    expect(parseResultFilter("not_priority", c)).toEqual({ outcome_type: "indifferent", perspective: null });
    for (const x of [undefined, "", "nope", ["stewards"], "matched"]) expect(parseResultFilter(x, c)).toBeNull();
    expect(resultFilterOptions(c)).toHaveLength(c.perspectives.perspectives.length + 4);
  });

  it("parse pages and releases strictly", () => {
    expect([undefined, "", "0", "1", "3", "-2", "x", "1e3"].map(parsePage)).toEqual([1, 1, 1, 1, 3, 1, 1, 1]);
    expect(PAGE_SIZE).toBe(50);
    expect(releaseVersions("0.4.0-0.2.2-0.8.0-0.5.1", ["0.4.0-0.2.2-0.8.0-0.5.1"])).toEqual({
      scoring: "0.4.0",
      taxonomy: "0.2.2",
      item_bank: "0.8.0",
      narratives: "0.5.1",
    });
    expect(releaseVersions("0.4.0-0.2.2-0.8.0-0.5.1", [])).toBeNull();
    expect(releaseVersions(["x"], ["x"])).toBeNull();
  });
});

describe("list rows", () => {
  it("name the result, the fit, and the guess or the quick check", () => {
    const base = { completed_on: "2026-10-14", outcome_reason: null, fit_rating: null, answered: 40, research_active: null, answers: {}, timings_ms: {} };
    const none = { prediction_kind: null, prediction_perspectives: null, quick_check_shown: null, quick_check_perspective: null, quick_check_rating: null };
    const rows = buildResponseList(
      [
        { ...base, ...none, id: "a", outcome_type: "matched", first: "stewards", second: "pragmatists", fit_rating: 4, prediction_kind: "between", prediction_perspectives: ["accelerators", "stewards"] },
        { ...base, ...none, id: "b", outcome_type: "mixed_between", first: "stewards", second: "pragmatists", quick_check_shown: "other", quick_check_perspective: "accelerators", quick_check_rating: 2 },
        { ...base, ...none, id: "c", outcome_type: "undecided", outcome_reason: "coverage", first: "stewards", second: null },
        { ...base, ...none, id: "d", outcome_type: "indifferent", first: null, second: null, prediction_kind: "skipped" },
      ],
      c,
      copy,
    );
    expect(rows.map((r) => r.result)).toEqual(["Stewards", "Between Stewards and Pragmatists", "Still forming (coverage)", "Not a priority"]);
    expect(rows[0].fit).toBe(`4 · ${copy.fit.options[3]}`);
    expect(rows[1].fit).toBe("–");
    expect(rows[0].guessOrCheck).toBe("Guess: between Accelerators and Stewards");
    expect(rows[1].guessOrCheck).toBe(`Quick check (other, Accelerators): ${copy.quick_check.options[1]}`);
    expect(rows[2].guessOrCheck).toBe("–");
    expect(rows[3].guessOrCheck).toBe("Guess: skipped");
    // Guessed In between Accelerators and Stewards, landed on Stewards: close. No guess, or a skip: "–".
    expect(rows.map((r) => r.guessMatched)).toEqual(["Close", "–", "–", "–"]);
    expect(rows.map((r) => r.research)).toEqual(["–", "–", "–", "–"]);
  });

  it("show research as Yes (active), Withdrawn (all withdrawn) or – (no row)", () => {
    expect([researchLabel(null), researchLabel(true), researchLabel(false)]).toEqual(["–", "Yes", "Withdrawn"]);
    expect([undefined, "", "yes", "no", "YES", ["yes"]].map(parseResearchFilter)).toEqual([null, null, "yes", "no", null, null]);
  });
});

describe("detail", () => {
  const answers = { ...(vectors.score_cases.find((v) => v.id === "steward")!.answers as Answers) };
  const seed = 4242;
  const raw: ResponseDetailRaw = {
    id: "abcdefghijklmn",
    completed_on: "2026-10-14",
    scoring_version: "0.4.0",
    taxonomy_version: "0.2.2",
    item_bank_version: "0.8.0",
    narratives_version: "0.5.1",
    sequence_version: "2",
    form: c.config.form,
    seed: String(seed),
    answer_direction: standardSequence(c, seed).direction,
    answers,
    free_text: { D9: "Write to me at someone@example.org, or just read this." },
    result: score(c, answers),
    timings_ms: {},
    fit_rating: 2,
    better_fit: "own_mix",
    track_checks: { C3: "about_right", C1: "further_low" },
    answer_changes: { "C3-02": 1, "C5-04": 2 },
    compared_with: "zyxwvutsrqponm",
    research: [{ created_on: "2026-10-15", withdrawn: false }],
    feedback: [{ created_on: "2026-10-15", type: "confusing_question", may_quote: true, body: "Odd wording. Reply to a@b.test please.", has_email: true }],
    prediction_kind: null,
    prediction_perspectives: null,
    quick_check_shown: "own",
    quick_check_perspective: "stewards",
    quick_check_rating: 5,
  };
  const d = buildResponseDetail(raw, c, copy);

  it("lists every answer in the item bank's order with the label seen, and the rest as skipped", () => {
    const keys = canonicalKeys(c, c.config.form).filter((k) => c.itemsById.get(k.split(":")[0])!.format !== "TXT");
    expect([...d.answers.map((a) => a.key), ...d.skipped.map((s) => s.key)].sort()).toEqual([...keys].sort());
    expect(d.answers.map((a) => a.key)).toEqual(keys.filter((k) => k in answers));
    const c101 = d.answers.find((a) => a.key === "C1-01")!;
    expect(c101.label).toBe(c.items.likert_labels[(answers["C1-01"] as number) - 1]);
    expect(c101.text).toBe(c.itemsById.get("C1-01")!.short);
  });

  it("shows the outcome with ranked distances, the versions, direction and seed", () => {
    expect(d.outcome).toBe("Stewards");
    expect(d.ranked).toHaveLength(c.perspectives.perspectives.length);
    expect(d.ranked[0]).toEqual({ name: "Stewards", distance: raw.result.outcome.ranked[0].distance.toFixed(3) });
    expect(d.versions.map((v) => v.value)).toEqual(["0.4.0", "0.2.2", "0.8.0", "0.5.1", "2", c.config.form]);
    expect(d.seed).toBe("4242");
  });

  it("puts everything they told us on one card, in order, with emails masked", () => {
    const told = Object.fromEntries(d.told.map((r) => [r.label, r]));
    expect(d.told.map((r) => r.label)).toEqual([
      "Guess before the result",
      "Quick check",
      "Does this fit you?",
      "Which fits you better?",
      "Check your six answers",
      "Answers changed on the results page",
      "Free text",
      "Compared with",
      "Research follow-up",
    ]);
    expect(told["Guess before the result"].value).toBe("–");
    expect(told["Quick check"].value).toBe(`(own, Stewards): ${copy.quick_check.options[4]}`);
    expect(told["Does this fit you?"].value).toBe(`2 · ${copy.fit.options[1]}`);
    expect(told["Which fits you better?"].value).toBe("My own mix");
    expect(told["Free text"].value).toBe("Write to me at [email removed], or just read this.");
    expect(told["Compared with"]).toEqual({ label: "Compared with", value: "zyxwvutsrqponm", href: "/admin/responses/zyxwvutsrqponm" });
    expect(told["Research follow-up"].value).toBe("Opted in on 2026-10-15");
    expect(d.feedback).toEqual([
      { date: "2026-10-15", type: copy.feedback.problem_options.find((o) => o.id === "confusing_question")!.label, quote: "Yes", email: "Yes", body: "Odd wording. Reply to [email removed] please." },
    ]);
    expect(JSON.stringify(d)).not.toMatch(/@/);
  });

  it("shows – for anything they didn't give", () => {
    const empty = buildResponseDetail(
      { ...raw, free_text: {}, fit_rating: null, better_fit: null, track_checks: {}, answer_changes: {}, compared_with: null, research: [], feedback: [], quick_check_shown: null },
      c,
      copy,
    );
    expect(empty.told.map((r) => r.value)).toEqual(["–", "–", "–", "–", "–", "–", "–", "–", "No"]);
    expect(empty.feedback).toEqual([]);
  });

  it("names themes as the content does in Check your six answers", () => {
    expect(trackChecksLines(c, { C3: "about_right", C1: "further_low" })).toEqual([
      `${c.narratives.constructs.C1.name}: further toward the low end`,
      `${c.narratives.constructs.C3.name}: about right`,
    ]);
    expect(Object.fromEntries(d.told.map((r) => [r.label, r.value]))["Check your six answers"]).not.toMatch(/\bC\d\b/);
  });

  it("counts changed answers, then lists each item, most changed first", () => {
    expect(answerChangesLine({ "C3-02": 1, "C5-04": 2 })).toBe("3 changes: C5-04 (2), C3-02 (1)");
    expect(answerChangesLine({ "C1-01": 1 })).toBe("1 change: C1-01 (1)");
    expect(answerChangesLine({})).toBe("–");
  });

  it("says Opted in, Withdrawn or No for research, never an email", () => {
    expect(researchFollowUp([])).toBe("No");
    expect(researchFollowUp([{ created_on: "2026-10-15", withdrawn: true }])).toBe("Withdrawn");
    expect(researchFollowUp([{ created_on: "2026-10-16", withdrawn: false }, { created_on: "2026-10-15", withdrawn: true }])).toBe("Opted in on 2026-10-16");
  });

  it("never shows a string answer among the answers", () => {
    const leaked = buildResponseDetail({ ...raw, answers: { ...answers, D9: "my secret words" } }, c, copy);
    expect(leaked.answers.map((a) => a.key)).not.toContain("D9");
    expect(JSON.stringify(leaked.answers)).not.toContain("my secret words");
  });
});

// Issue #55: the list's quality filter and In between pairs.
describe("list filters", () => {
  const statements = statementKeys(c);
  const slow = Object.fromEntries(statements.map((k) => [k, 6_000]));
  const varied = Object.fromEntries(statements.map((k, i) => [k, (i % 7) + 1]));
  const none = { prediction_kind: null, prediction_perspectives: null, quick_check_shown: null, quick_check_perspective: null, quick_check_rating: null };
  const base = { completed_on: "2026-10-14", outcome_reason: null, fit_rating: null, answered: 40, research_active: null, ...none };
  const rows: ResponseListRaw[] = [
    { ...base, id: "a", outcome_type: "mixed_between", first: "stewards", second: "pragmatists", answers: varied, timings_ms: slow },
    { ...base, id: "b", outcome_type: "mixed_between", first: "pragmatists", second: "stewards", answers: varied, timings_ms: slow, research_active: true },
    { ...base, id: "c", outcome_type: "mixed_between", first: "stewards", second: "accelerators", answers: varied, timings_ms: slow },
    { ...base, id: "d", outcome_type: "matched", first: "stewards", second: "pragmatists", answers: Object.fromEntries(statements.map((k) => [k, 4])), timings_ms: slow },
  ];
  const run = (f: Partial<ListFilters>, page = 1) => pageOfResponses(rows, c, copy, { result: null, research: null, check: null, ...f }, page);

  it("offers a filter option for each In between pair with a response, and filters by it either way round", () => {
    const { pairs } = run({});
    const options = resultFilterOptions(c, pairs).filter((o) => o.value.startsWith("between:"));
    expect(options.map((o) => o.label)).toEqual(["In between: Pragmatists and Stewards", "In between: Accelerators and Stewards"]);
    const filter = parseResultFilter(options[0].value, c);
    expect(run({ result: filter }).rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(parseResultFilter("between:stewards+pragmatists", c)).toEqual(parseResultFilter("between:pragmatists+stewards", c));
    expect(parseResultFilter("between:stewards+stewards", c)).toBeNull();
    expect(parseResultFilter("between:stewards+nobody", c)).toBeNull();
  });

  it("filters by the quality flags and shows them in the Check column", () => {
    expect(run({ check: "flagged" }).rows.map((r) => [r.id, r.check])).toEqual([["d", "Same answer"]]);
    expect(run({ check: "clean" }).total).toBe(3);
    expect(run({ research: "yes" }).rows.map((r) => r.id)).toEqual(["b"]);
    expect(run({}, 2).rows).toEqual([]);
    expect(run({}).total).toBe(4);
  });

  it("the detail page's time line", () => {
    expect(timingLine(c, { answers: varied, timings_ms: slow }, null)).toBe("3 min 0 s in all · 6 s per statement (median) · not flagged");
    expect(timingLine(c, { answers: varied, timings_ms: slow }, 600_000)).toContain("flagged: Too fast");
  });
});

describe("detail: the guess", () => {
  it("starts with a capital", () => {
    const answers = vectors.score_cases.find((v) => v.id === "indifferent")!.answers as Answers;
    const raw = {
      id: "abcdefghijklmn", completed_on: "2026-10-14", scoring_version: "0.4.0", taxonomy_version: "0.3.1", item_bank_version: "0.8.0",
      narratives_version: "0.7.0", sequence_version: "2", form: c.config.form, seed: "1", answer_direction: "agree_first", answers,
      free_text: {}, result: score(c, answers), timings_ms: {}, fit_rating: null, better_fit: null, track_checks: {}, answer_changes: {},
      compared_with: null, research: [], feedback: [], prediction_kind: "not_priority", prediction_perspectives: null,
      quick_check_shown: null, quick_check_perspective: null, quick_check_rating: null,
    } satisfies ResponseDetailRaw;
    expect(buildResponseDetail(raw, c, copy).told.find((t) => t.label === "Guess before the result")!.value).toBe("Not a priority");
  });
});

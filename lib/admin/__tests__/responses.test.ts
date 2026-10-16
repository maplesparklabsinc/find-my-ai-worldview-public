// /admin/responses (issue #37): filters, list rows and the detail view.
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import {
  PAGE_SIZE,
  buildResponseDetail,
  buildResponseList,
  canonicalKeys,
  parsePage,
  parseResultFilter,
  releaseVersions,
  resultFilterOptions,
  type ResponseDetailRaw,
} from "@/lib/admin/responses";
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
    const base = { completed_on: "2026-10-14", outcome_reason: null, fit_rating: null, answered: 40 };
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
    free_text_answered: true,
    result: score(c, answers),
    fit_rating: 2,
    better_fit: "own_mix",
    track_checks: { C1: "further_low" },
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

  it("shows the outcome with ranked distances, the versions, direction and seed, and never free text", () => {
    expect(d.outcome).toBe("Stewards");
    expect(d.ranked).toHaveLength(c.perspectives.perspectives.length);
    expect(d.ranked[0]).toEqual({ name: "Stewards", distance: raw.result.outcome.ranked[0].distance.toFixed(3) });
    expect(d.versions.map((v) => v.value)).toEqual(["0.4.0", "0.2.2", "0.8.0", "0.5.1", "2", c.config.form]);
    expect(d.seed).toBe("4242");
    expect(d.freeText).toBe("Free text: answered");
    expect(buildResponseDetail({ ...raw, free_text_answered: false }, c, copy).freeText).toBe("Free text: not answered");
    expect(d.guessOrCheck).toBe(`Quick check (own, Stewards): ${copy.quick_check.options[4]}`);
    expect(d.fit.map((f) => f.value)).toEqual([`2 · ${copy.fit.options[1]}`, "My own mix", "C1: further toward the low end"]);
  });

  it("drops a free-text answer even if one reaches it", () => {
    const leaked = buildResponseDetail({ ...raw, answers: { ...answers, D9: "my secret words" } }, c, copy);
    expect(JSON.stringify(leaked)).not.toContain("my secret words");
  });
});

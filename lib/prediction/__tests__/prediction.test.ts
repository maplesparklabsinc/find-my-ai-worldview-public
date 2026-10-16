// The guess before the result (issue #24): validated on its own, stored apart
// from the result, never used in scoring, and described without right or wrong.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { SEQUENCE_VERSION, standardSequence } from "@/lib/form";
import { landedAsExpected, predictionSchema, reflectionText, type Prediction } from "@/lib/prediction";
import { score, type Answers, type Outcome } from "@/lib/scoring";
import { checkResponse } from "@/lib/submit";

const c = getContent();
const copy = getCopy();
const ids = c.perspectives.perspectives.map((p) => p.id);
const seed = 12345;

function payload(answers: Answers, over: Record<string, unknown> = {}) {
  const keys = standardSequence(c, seed).steps.map((s) => s.key);
  const timings = Object.fromEntries(keys.map((k) => [k, 4000]));
  return { form: c.config.form, seed, sequence_version: SEQUENCE_VERSION, answers, timings_ms: timings, ...over };
}

const outcomeOf = (id: string): Outcome => score(c, vectors.score_cases.find((v) => v.id === id)!.answers as Answers).outcome;

const every: Prediction[] = [
  ...ids.map((id): Prediction => ({ kind: "perspective", perspectives: [id] })),
  { kind: "between", perspectives: [ids[0], ids[1]] },
  { kind: "own_combination" },
  { kind: "forming" },
  { kind: "not_priority" },
];

describe("prediction payload", () => {
  it("accepts every named and broad outcome, and a skip", () => {
    for (const p of [...every, { kind: "skipped" }]) expect(predictionSchema.safeParse(p).success).toBe(true);
  });

  it("needs two different perspectives for 'between', and no IDs on broad kinds", () => {
    expect(predictionSchema.safeParse({ kind: "between", perspectives: [ids[0], ids[0]] }).success).toBe(false);
    expect(predictionSchema.safeParse({ kind: "between", perspectives: [ids[0]] }).success).toBe(false);
    expect(predictionSchema.safeParse({ kind: "perspective", perspectives: [ids[0], ids[1]] }).success).toBe(false);
    expect(predictionSchema.safeParse({ kind: "forming", perspectives: [ids[0]] }).success).toBe(false);
    expect(predictionSchema.safeParse({ kind: "right" }).success).toBe(false);
  });

  it("is stored with the response but never changes the result", () => {
    const answers = vectors.score_cases.find((v) => v.id === "steward")!.answers as Answers;
    const without = checkResponse(c, payload(answers));
    expect(without).toMatchObject({ ok: true, value: { prediction_kind: null, prediction_perspectives: null } });
    for (const prediction of [...every, { kind: "skipped" }]) {
      const r = checkResponse(c, payload(answers, { prediction }));
      expect(r.ok).toBe(true);
      if (!r.ok || !without.ok) return;
      expect(r.value.result).toEqual(without.value.result);
      expect(r.value.outcome_type).toBe(without.value.outcome_type);
      expect(r.value.closest_perspective).toBe(without.value.closest_perspective);
      expect(r.value.prediction_kind).toBe(prediction.kind);
    }
  });

  it("stores a pair sorted, and rejects perspectives that don't exist", () => {
    const answers = vectors.score_cases[0].answers as Answers;
    const r = checkResponse(c, payload(answers, { prediction: { kind: "between", perspectives: ["stewards", "accelerators"] } }));
    expect(r).toMatchObject({ ok: true, value: { prediction_kind: "between", prediction_perspectives: ["accelerators", "stewards"] } });
    expect(checkResponse(c, payload(answers, { prediction: { kind: "perspective", perspectives: ["rights_first"] } })).ok).toBe(false);
    expect(checkResponse(c, payload(answers, { prediction: { kind: "between", perspectives: ["stewards", "stewards"] } })).ok).toBe(false);
  });

  it("is never read by the public result, comparison or share image", () => {
    const db = readFileSync("lib/db/index.ts", "utf8");
    const read = db.slice(db.indexOf("export async function getResponse"));
    expect(read).not.toMatch(/prediction/);
    for (const f of ["lib/stored/index.ts", "lib/results/index.ts", "components/share-card.tsx", "app/r/[id]/image/route.ts", "app/r/[id]/opengraph-image.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/prediction/i);
    }
  });
});

describe("reflection", () => {
  const steward = outcomeOf("steward");

  it("says the guess and the result landed together when they did", () => {
    expect(landedAsExpected({ kind: "perspective", perspectives: [steward.ranked[0].id] }, steward)).toBe(true);
    expect(reflectionText(c, copy, { kind: "perspective", perspectives: ["stewards"] }, steward)).toBe(
      "You expected **Stewards**, and that's where your answers landed closest.",
    );
  });

  it("sets a different guess beside the result", () => {
    expect(reflectionText(c, copy, { kind: "perspective", perspectives: ["accelerators"] }, steward)).toBe(
      "You expected **Accelerators**. Your answers landed closest to **Stewards**.",
    );
  });

  it("matches each broad outcome and a pair in either order", () => {
    const between = outcomeOf("mixed_between");
    const [a, b] = between.ranked;
    expect(landedAsExpected({ kind: "between", perspectives: [b.id, a.id] }, between)).toBe(true);
    expect(landedAsExpected({ kind: "own_combination" }, outcomeOf("mixed_unmatched"))).toBe(true);
    expect(landedAsExpected({ kind: "forming" }, outcomeOf("undecided_confidence"))).toBe(true);
    expect(landedAsExpected({ kind: "forming" }, outcomeOf("undecided_coverage"))).toBe(false);
    expect(landedAsExpected({ kind: "not_priority" }, outcomeOf("indifferent"))).toBe(true);
  });

  it("has a sentence for every guess and outcome, with no right-or-wrong words", () => {
    const outcomes = ["steward", "mixed_between", "mixed_unmatched", "undecided_confidence", "undecided_coverage", "indifferent"].map(outcomeOf);
    for (const p of every) {
      for (const o of outcomes) {
        const text = reflectionText(c, copy, p, o)!;
        expect(text).not.toMatch(/\{|\}|undefined/);
        expect(text).not.toMatch(/\b(correct|incorrect|accurate|inaccurate|wrong|right)\b/i);
      }
    }
    expect(reflectionText(c, copy, { kind: "skipped" }, steward)).toBeNull();
    expect(copy.reflection.prompt).not.toMatch(/\b(correct|wrong)\b/i);
  });
});

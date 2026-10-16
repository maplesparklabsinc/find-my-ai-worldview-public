// What the write routes accept (docs/01-product-spec.md section 6.2).
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { contentVersions, getContent } from "@/lib/content";
import { SEQUENCE_VERSION, standardSequence } from "@/lib/form";
import { score, type Answers } from "@/lib/scoring";
import {
  checkFeedback,
  checkPatch,
  checkResearchContact,
  checkResponse,
  MIN_TOTAL_MS,
  newResponseId,
} from "@/lib/submit";
import { getCopy } from "@/lib/content/copy";

const c = getContent();
const full = vectors.score_cases[0].answers as Answers;
const seed = 12345;

function payload(over: Record<string, unknown> = {}) {
  const keys = standardSequence(c, seed).steps.map((s) => s.key);
  const timings = Object.fromEntries(keys.map((k) => [k, 4000]));
  return { form: c.config.form, seed, sequence_version: SEQUENCE_VERSION, answers: full, timings_ms: timings, ...over };
}

describe("checkResponse", () => {
  it("accepts a full quiz and recomputes the result on the server", () => {
    const r = checkResponse(c, payload());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expected = score(c, full);
    expect(r.value.result).toEqual(expected);
    expect(r.value.outcome_type).toBe(expected.outcome.type);
    expect(r.value.closest_perspective).toBe(expected.outcome.ranked[0]?.id ?? null);
    const v = contentVersions(c);
    expect([r.value.scoring_version, r.value.taxonomy_version, r.value.item_bank_version, r.value.narratives_version]).toEqual([
      v.scoring,
      v.taxonomy,
      v.item_bank,
      v.narratives,
    ]);
    expect(r.value.answer_direction).toBe(standardSequence(c, seed).direction);
  });

  it("rejects extra fields, such as a result computed in the browser", () => {
    expect(checkResponse(c, payload({ result: { outcome: { type: "matched" } } })).ok).toBe(false);
  });

  it("accepts skipped questions", () => {
    const some = Object.fromEntries(Object.entries(full).slice(0, 5));
    const r = checkResponse(c, payload({ answers: some }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.result).toEqual(score(c, some));
  });

  it("rejects unknown questions and impossible answers", () => {
    expect(checkResponse(c, payload({ answers: { ...full, "ZZ-99": 4 } }))).toMatchObject({ ok: false });
    expect(checkResponse(c, payload({ answers: { ...full, "C1-01": 8 } }))).toMatchObject({ ok: false });
    expect(checkResponse(c, payload({ answers: { ...full, "C1-01": 2.5 } }))).toMatchObject({ ok: false });
    expect(checkResponse(c, payload({ answers: { ...full, "C3-T1": { choice: 2, strength: "strongly" } } }))).toMatchObject({ ok: false });
    expect(checkResponse(c, payload({ answers: { ...full, D4: { "Not a row": 0 } } }))).toMatchObject({ ok: false });
    expect(checkResponse(c, payload({ answers: { ...full, D9: "x".repeat(getCopy().quiz.free_text_max + 1) } }))).toMatchObject({
      ok: false,
    });
  });

  it("rejects completions faster than the minimum", () => {
    const keys = Object.keys(payload().timings_ms);
    const fast = Object.fromEntries(keys.map((k) => [k, Math.floor((MIN_TOTAL_MS - 1) / keys.length)]));
    expect(checkResponse(c, payload({ timings_ms: fast }))).toEqual({ ok: false, error: "completed too quickly", reason: "too_quick" });
  });

  it("says when a quiz is from another version, so the page can offer to start again (issue #18)", () => {
    expect(checkResponse(c, payload({ form: "P" }))).toMatchObject({ ok: false, reason: "outdated" });
    expect(checkResponse(c, payload({ sequence_version: "999" }))).toMatchObject({ ok: false, reason: "outdated" });
    expect(checkResponse(c, payload({ answers: { ...full, "ZZ-99": 4 } }))).toMatchObject({ ok: false, reason: "outdated" });
    // A malformed request isn't something the person can fix.
    expect(checkResponse(c, payload({ result: {} }))).not.toHaveProperty("reason");
  });

  it("keeps the submission key, and accepts its absence from older tabs", () => {
    const key = "0b6f3c9e-6a52-4c1e-9d3e-2f8a7b1c4d5e"; // gitleaks:allow (a random UUID, not a secret)
    const r = checkResponse(c, payload({ submission_key: key }));
    expect(r.ok && r.value.submission_key).toBe(key);
    const old = checkResponse(c, payload());
    expect(old.ok && old.value.submission_key).toBeNull();
    expect(checkResponse(c, payload({ submission_key: "not-a-uuid" })).ok).toBe(false);
  });

  it("rejects an unknown form, sequence version or seed", () => {
    expect(checkResponse(c, payload({ form: "P" })).ok).toBe(false);
    expect(checkResponse(c, payload({ sequence_version: "999" })).ok).toBe(false);
    expect(checkResponse(c, payload({ seed: -1 })).ok).toBe(false);
  });

  it("stores the quick check only for a known perspective", () => {
    const p = c.perspectives.perspectives[0].id;
    const ok = checkResponse(c, payload({ quick_check: { shown: "own", perspective: p, rating: 4 } }));
    expect(ok.ok && [ok.value.quick_check_shown, ok.value.quick_check_perspective, ok.value.quick_check_rating]).toEqual(["own", p, 4]);
    expect(checkResponse(c, payload({ quick_check: { shown: "own", perspective: "nobody", rating: 4 } })).ok).toBe(false);
  });
});

describe("newResponseId", () => {
  it("is 14 base-62 characters and does not repeat", () => {
    const ids = new Set(Array.from({ length: 2000 }, newResponseId));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{14}$/);
  });
});

describe("other writes", () => {
  it("patch takes result feedback and nothing else (no first names)", () => {
    expect(checkPatch(c, { fit_rating: 3 }).ok).toBe(true);
    expect(checkPatch(c, { compare_name: "Sam" }).ok).toBe(false);
    expect(checkPatch(c, { better_fit: "stewards" }).ok).toBe(true);
    expect(checkPatch(c, { better_fit: "own_mix" }).ok).toBe(true);
    expect(checkPatch(c, { better_fit: "nobody" }).ok).toBe(false);
    expect(checkPatch(c, { track_checks: { C1: "about_right", C3: "further_high" } }).ok).toBe(true);
    expect(checkPatch(c, { track_checks: { C9: "about_right" } }).ok).toBe(false);
    expect(checkPatch(c, { track_checks: { C1: "maybe" } }).ok).toBe(false);
    expect(checkPatch(c, {}).ok).toBe(false);
    expect(checkPatch(c, { fit_rating: 6 }).ok).toBe(false);
    expect(checkPatch(c, { outcome_type: "matched" }).ok).toBe(false);
  });

  it("accepts answer changes only for questions in the quiz", () => {
    const ok = checkResponse(c, payload({ answer_changes: { "C1-01": 2 } }));
    expect(ok.ok && ok.value.answer_changes).toEqual({ "C1-01": 2 });
    expect(checkResponse(c, payload({ answer_changes: { "ZZ-99": 1 } })).ok).toBe(false);
    expect(checkResponse(c, payload({ answer_changes: { "C1-01": 0 } })).ok).toBe(false);
  });

  it("research contact needs ticked consent on the current consent text", () => {
    const v = getCopy().research_consent.consent_version;
    const base = { email: " Person@Example.com ", response_id: "abcdefghijkl", consent_version: v, consent: true };
    expect(checkResearchContact(base)).toEqual({
      ok: true,
      value: { email: "person@example.com", response_id: "abcdefghijkl", consent_version: v },
    });
    expect(checkResearchContact({ ...base, consent: false }).ok).toBe(false);
    expect(checkResearchContact({ ...base, consent_version: "0.0.0" }).ok).toBe(false);
    expect(checkResearchContact({ ...base, email: "not an email" }).ok).toBe(false);
  });

  it("feedback checks its type, items and perspectives", () => {
    const base = { type: "confusing_question", body: "Hard to read", item_ids: ["C1-01"] };
    const r = checkFeedback(c, base);
    expect(r.ok && r.value).toMatchObject({ type: "confusing_question", may_quote: false, email: null, versions: contentVersions(c) });
    expect(checkFeedback(c, { ...base, type: "spam" }).ok).toBe(false);
    expect(checkFeedback(c, { ...base, item_ids: ["ZZ-99"] }).ok).toBe(false);
    expect(checkFeedback(c, { ...base, perspective_ids: ["nobody"] }).ok).toBe(false);
    expect(checkFeedback(c, { ...base, body: "  " }).ok).toBe(false);
  });
});

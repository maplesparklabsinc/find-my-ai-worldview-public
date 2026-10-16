// Checks what the browser sends before anything is stored (docs/01-product-spec.md
// section 6.2). Pure: no database, no request objects, so it is unit tested and
// the API routes stay thin.
//
// A completed quiz is checked against the item bank (known keys for this seed's
// question order, valid values for each format) and the result is recomputed
// here with the shared scoring module, so a tampered request cannot store an
// impossible result. Whatever result the browser computed is ignored.
import { z } from "zod";
import { contentVersions, type Content, type Item } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { SEQUENCE_VERSION, isValidSeed, standardSequence, stepItem } from "@/lib/form";
import { predictionError, predictionSchema, type Prediction } from "@/lib/prediction";
import { countryOf } from "@/lib/results";
import { score, type Answers, type AnswerValue, type ScoreResult } from "@/lib/scoring";
import type { UndecidedReason } from "@/lib/scoring";

/** Largest request body accepted by any write route, in bytes. */
export const MAX_BODY_BYTES = 64 * 1024;
/** Completions faster than this in total are rejected. */
export const MIN_TOTAL_MS = 60_000;
/** Longest time counted for one question, so a tab left open does not skew timings. */
export const MAX_STEP_MS = 30 * 60_000;

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const RESPONSE_ID_LENGTH = 14;
export const responseIdSchema = z.string().regex(/^[A-Za-z0-9]{12,32}$/);

/** A random, unguessable response ID (14 base-62 characters, about 83 bits). */
export function newResponseId(): string {
  const out: string[] = [];
  const buf = new Uint8Array(32);
  while (out.length < RESPONSE_ID_LENGTH) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      // 248 = 4 * 62: rejecting the top values keeps every character equally likely.
      if (b < 248 && out.length < RESPONSE_ID_LENGTH) out.push(ID_ALPHABET[b % 62]);
    }
  }
  return out.join("");
}

/**
 * Why a save was refused, when the person can do something about it (issue #18).
 * The API sends it as `reason`, and the finishing screen picks its message by it.
 *  - too_quick: finished faster than MIN_TOTAL_MS
 *  - outdated: the tab holds a different version of the quiz than the server
 *  - rate_limited: set by the route, not here
 */
export type SaveRefusal = "too_quick" | "outdated" | "rate_limited";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; reason?: SaveRefusal };

const fail = (error: string, reason?: SaveRefusal): { ok: false; error: string; reason?: SaveRefusal } =>
  reason ? { ok: false, error, reason } : { ok: false, error };

// ---------- POST /api/responses ----------

const rating = z.number().int().min(1).max(5);

export const responsePayloadSchema = z.strictObject({
  form: z.string().min(1),
  seed: z.number().refine(isValidSeed, "invalid seed"),
  sequence_version: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  timings_ms: z.record(z.string(), z.number().nonnegative()),
  /** Times each answer was changed after going Back. Older clients may leave it out. */
  answer_changes: z.record(z.string(), z.number().int().min(1).max(1000)).optional(),
  quick_check: z
    .strictObject({ shown: z.enum(["own", "other"]), perspective: z.string().min(1), rating })
    .nullish(),
  compared_with: responseIdSchema.nullish(),
  /** The optional guess made before the result (issue #24). Never used in scoring. Older clients leave it out. */
  prediction: predictionSchema.nullish(),
  /** A random UUID per completed quiz, so saving it again returns the first save. Older clients leave it out. */
  submission_key: z.uuid().optional(),
});

export type ResponsePayload = z.infer<typeof responsePayloadSchema>;

/** One row for the responses table, minus the ID and date the database sets. */
export interface ResponseRow {
  scoring_version: string;
  taxonomy_version: string;
  item_bank_version: string;
  narratives_version: string;
  sequence_version: string;
  form: string;
  seed: number;
  answer_direction: "disagree_first" | "agree_first";
  answers: Answers;
  timings_ms: Record<string, number>;
  answer_changes: Record<string, number>;
  outcome_type: ScoreResult["outcome"]["type"];
  outcome_reason: UndecidedReason | null;
  closest_perspective: string | null;
  tension_id: string | null;
  country: string | null;
  result: ScoreResult;
  quick_check_shown: "own" | "other" | null;
  quick_check_perspective: string | null;
  quick_check_rating: number | null;
  compared_with: string | null;
  /** What the person guessed before seeing the result; null from clients that never asked. */
  prediction_kind: Prediction["kind"] | null;
  /** The guessed perspective (one) or pair (two, sorted); null otherwise. */
  prediction_perspectives: string[] | null;
  /** The payload's submission key (stored hashed), or null from older clients. */
  submission_key: string | null;
}

function validAnswer(item: Item, v: unknown, freeTextMax: number): v is AnswerValue {
  const isIndex = (x: unknown, n: number) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < n;
  switch (item.format) {
    case "L7":
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 7;
    case "SC":
    case "CAT":
      return isIndex(v, item.options.length);
    case "TO": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      const keys = Object.keys(v);
      const t = v as { choice?: unknown; strength?: unknown };
      return keys.length === 2 && (t.choice === 0 || t.choice === 1) && (t.strength === "slightly" || t.strength === "strongly");
    }
    case "GRID": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      const entries = Object.entries(v);
      return entries.length > 0 && entries.every(([row, x]) => item.rows.includes(row) && isIndex(x, item.options.length));
    }
    case "TXT":
      return typeof v === "string" && v.trim().length > 0 && v.length <= freeTextMax;
  }
}

/**
 * Validate a completed quiz and build the row to store. The question order is
 * rebuilt from the seed, so only keys this person could have been shown are
 * accepted; anything else is an error, not silently dropped.
 */
export function checkResponse(c: Content, raw: unknown): Checked<ResponseRow> {
  const parsed = responsePayloadSchema.safeParse(raw);
  if (!parsed.success) return fail(`invalid payload: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  const p = parsed.data;

  // A tab opened before a content release can hold an older form or question
  // order. Its answers can't be checked against this one, so it can't be saved.
  if (p.form !== c.config.form) return fail(`unknown form ${p.form}`, "outdated");
  if (p.sequence_version !== SEQUENCE_VERSION) return fail(`unknown sequence version ${p.sequence_version}`, "outdated");

  const seq = standardSequence(c, p.seed);
  const steps = new Map(seq.steps.map((s) => [s.key, s]));
  const freeTextMax = getCopy().quiz.free_text_max;

  const answers: Answers = {};
  for (const [key, v] of Object.entries(p.answers)) {
    const step = steps.get(key);
    if (!step) return fail(`unknown question ${key}`, "outdated");
    if (!validAnswer(stepItem(c, step), v, freeTextMax)) return fail(`invalid answer for ${key}`, "outdated");
    answers[key] = v;
  }

  const timings: Record<string, number> = {};
  let total = 0;
  for (const [key, ms] of Object.entries(p.timings_ms)) {
    if (!steps.has(key)) return fail(`unknown question ${key} in timings`, "outdated");
    const t = Math.min(Math.round(ms), MAX_STEP_MS);
    timings[key] = t;
    total += t;
  }
  if (total < MIN_TOTAL_MS) return fail("completed too quickly", "too_quick");

  const changes = p.answer_changes ?? {};
  const badChange = Object.keys(changes).find((key) => !steps.has(key));
  if (badChange) return fail(`unknown question ${badChange} in answer changes`);

  const qc = p.quick_check ?? null;
  if (qc && !c.perspectives.perspectives.some((x) => x.id === qc.perspective)) {
    return fail(`unknown perspective ${qc.perspective}`);
  }

  const prediction = p.prediction ?? null;
  const predictionProblem = prediction && predictionError(c, prediction);
  if (predictionProblem) return fail(predictionProblem);

  // Scored from the answers alone; the prediction plays no part.
  const result = score(c, answers);
  const v = contentVersions(c);
  const ranked = result.outcome.ranked;
  return {
    ok: true,
    value: {
      scoring_version: v.scoring,
      taxonomy_version: v.taxonomy,
      item_bank_version: v.item_bank,
      narratives_version: v.narratives,
      sequence_version: seq.sequenceVersion,
      form: seq.form,
      seed: seq.seed,
      answer_direction: seq.direction,
      answers,
      timings_ms: timings,
      answer_changes: changes,
      outcome_type: result.outcome.type,
      outcome_reason: result.outcome.type === "undecided" ? result.outcome.reason : null,
      closest_perspective: ranked.length > 0 ? ranked[0].id : null,
      tension_id: result.tension?.id ?? null,
      country: countryOf(c, getCopy(), answers),
      result,
      quick_check_shown: qc?.shown ?? null,
      quick_check_perspective: qc?.perspective ?? null,
      quick_check_rating: qc?.rating ?? null,
      compared_with: p.compared_with ?? null,
      prediction_kind: prediction?.kind ?? null,
      prediction_perspectives: prediction && "perspectives" in prediction ? [...prediction.perspectives].sort() : null,
      submission_key: p.submission_key ?? null,
    },
  };
}

// ---------- PATCH /api/responses/{id} ----------

export const BETTER_FIT_OTHER = ["none", "own_mix"] as const;
export const TRACK_CHECKS = ["about_right", "further_low", "further_high"] as const;

export const responsePatchSchema = z
  .strictObject({
    fit_rating: rating.optional(),
    /** A perspective ID, "none" or "own_mix" (spec 5.6 item 9). */
    better_fit: z.string().regex(/^[a-z_]{1,40}$/).optional(),
    /** Construct ID -> check. Merged into what is stored, so each track can be answered separately. */
    track_checks: z.record(z.string(), z.enum(TRACK_CHECKS)).optional(),
  })
  .refine((x) => Object.keys(x).length > 0, "nothing to update");

export type ResponsePatch = z.infer<typeof responsePatchSchema>;

export function checkPatch(c: Content, raw: unknown): Checked<ResponsePatch> {
  const r = responsePatchSchema.safeParse(raw);
  if (!r.success) return fail(`invalid payload: ${r.error.issues[0]?.message ?? "unknown"}`);
  const p = r.data;
  const known = new Set<string>([...c.perspectives.perspectives.map((x) => x.id), ...BETTER_FIT_OTHER]);
  if (p.better_fit !== undefined && !known.has(p.better_fit)) return fail(`unknown perspective ${p.better_fit}`);
  const bad = Object.keys(p.track_checks ?? {}).find((k) => !c.config.scored_constructs.includes(k));
  if (bad) return fail(`unknown question ${bad}`);
  return { ok: true, value: p };
}

// ---------- POST /api/research-contact ----------

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const researchContactSchema = z.strictObject({
  email,
  response_id: responseIdSchema,
  consent_version: z.string().min(1),
  consent: z.literal(true),
});

export type ResearchContact = Omit<z.infer<typeof researchContactSchema>, "consent">;

export function checkResearchContact(raw: unknown): Checked<ResearchContact> {
  const r = researchContactSchema.safeParse(raw);
  if (!r.success) return fail(`invalid payload: ${r.error.issues[0]?.message ?? "unknown"}`);
  const current = getCopy().research_consent.consent_version;
  if (r.data.consent_version !== current) return fail("consent text has changed; reload and try again");
  return { ok: true, value: { email: r.data.email, response_id: r.data.response_id, consent_version: r.data.consent_version } };
}

// ---------- POST /api/feedback ----------

export const feedbackSchema = z.strictObject({
  type: z.string().min(1),
  item_ids: z.array(z.string().min(1)).max(20).default([]),
  perspective_ids: z.array(z.string().min(1)).max(10).default([]),
  body: z.string().trim().min(1).max(5000),
  evidence: z.string().trim().max(2000).optional(),
  email: email.optional(),
  may_quote: z.boolean().default(false),
  response_id: responseIdSchema.optional(),
});

export interface FeedbackRow {
  type: string;
  item_ids: string[];
  perspective_ids: string[];
  versions: ReturnType<typeof contentVersions>;
  body: string;
  evidence: string | null;
  email: string | null;
  may_quote: boolean;
  response_id: string | null;
}

export function checkFeedback(c: Content, raw: unknown): Checked<FeedbackRow> {
  const r = feedbackSchema.safeParse(raw);
  if (!r.success) return fail(`invalid payload: ${r.error.issues[0]?.message ?? "unknown"}`);
  const f = r.data;
  if (!getCopy().feedback.problem_options.some((o) => o.id === f.type)) return fail(`unknown feedback type ${f.type}`);
  const badItem = f.item_ids.find((id) => !c.itemsById.has(id));
  if (badItem) return fail(`unknown item ${badItem}`);
  const badP = f.perspective_ids.find((id) => !c.perspectives.perspectives.some((p) => p.id === id));
  if (badP) return fail(`unknown perspective ${badP}`);
  return {
    ok: true,
    value: {
      type: f.type,
      item_ids: f.item_ids,
      perspective_ids: f.perspective_ids,
      versions: contentVersions(c),
      body: f.body,
      evidence: f.evidence || null,
      email: f.email ?? null,
      may_quote: f.may_quote,
      response_id: f.response_id ?? null,
    },
  };
}

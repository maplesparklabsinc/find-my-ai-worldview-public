// Single responses for the admin pages (/admin/responses, issue #37): the
// filters in the URL, and the rows lib/db/admin.ts reads turned into what the
// list and detail pages show. Pure, so it can be tested without a database.
//
// Never an email address: the queries never read an email column (only whether
// there is a research row, or whether feedback left an address), and the
// free-text answer and feedback text go through maskEmails before they reach a
// page (issue #51). Rows are copied field by field, never spread.
import type { Content, Item, Versions } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";
import type { Answers, AnswerValue, ScoreResult, TradeoffAnswer } from "@/lib/scoring";
import { countOf, itemText } from "./index";
import { guessMatch, guessMatchLabel } from "./guess";
import { betweenPairs, pairKey, type BetweenPair } from "./insights";
import { maskEmails } from "./mask";
import { duration, flagsLabel, quality, releaseMedianMs, statementKeys, totalMs, type CheckFilter, type QualityFlag } from "./quality";

export const PAGE_SIZE = 50;

/** What the result filter can be set to: a closest perspective, one of the other outcomes, or one In between pair. */
export type ResultFilter =
  | { outcome_type: "matched"; perspective: string }
  | { outcome_type: Exclude<OutcomeKey, "matched">; perspective: null; pair?: [string, string] };

type OutcomeKey = "matched" | "mixed_between" | "mixed_unmatched" | "undecided" | "indifferent";

const OTHER_OUTCOMES: { value: string; outcome_type: Exclude<OutcomeKey, "matched">; label: string }[] = [
  { value: "between", outcome_type: "mixed_between", label: "In between" },
  { value: "own_combination", outcome_type: "mixed_unmatched", label: "Own combination" },
  { value: "forming", outcome_type: "undecided", label: "Still forming" },
  { value: "not_priority", outcome_type: "indifferent", label: "Not a priority" },
];

/**
 * The options for the result filter: perspectives in their listed order, the
 * other outcomes, then "In between: <pair>" for each pair with a response
 * (value "between:a+b", issue #55 section 9).
 */
export function resultFilterOptions(content: Content, pairs: BetweenPair[] = []): { value: string; label: string }[] {
  return [
    ...content.perspectives.perspectives.map((p) => ({ value: p.id, label: p.name })),
    ...OTHER_OUTCOMES.map(({ value, label }) => ({ value, label })),
    ...pairs.map((p) => ({ value: `between:${p.key}`, label: `In between: ${p.label}` })),
  ];
}

/** `?result=` from the URL, or null for "all" (and for anything unknown). */
export function parseResultFilter(raw: unknown, content: Content): ResultFilter | null {
  if (typeof raw !== "string" || raw === "") return null;
  const known = (id: string) => content.perspectives.perspectives.some((p) => p.id === id);
  const pair = /^between:([a-z_]+)\+([a-z_]+)$/.exec(raw);
  if (pair && known(pair[1]) && known(pair[2]) && pair[1] !== pair[2]) {
    return { outcome_type: "mixed_between", perspective: null, pair: [pair[1], pair[2]].sort() as [string, string] };
  }
  const other = OTHER_OUTCOMES.find((o) => o.value === raw);
  if (other) return { outcome_type: other.outcome_type, perspective: null };
  return content.perspectives.perspectives.some((p) => p.id === raw) ? { outcome_type: "matched", perspective: raw } : null;
}

/** `?research=`: opted in (an active research row) or not. Null for "all" and anything unknown. */
export type ResearchFilter = "yes" | "no";

export function parseResearchFilter(raw: unknown): ResearchFilter | null {
  return raw === "yes" || raw === "no" ? raw : null;
}

/**
 * The Research column: "Yes" with an active (not withdrawn) research row,
 * "Withdrawn" when every row is withdrawn, "–" with none. `active` is
 * bool_or(not withdrawn) over the response's rows: null when there are none.
 */
export function researchLabel(active: boolean | null): string {
  return active === null ? "–" : active ? "Yes" : "Withdrawn";
}

/** `?page=` from the URL: a whole number from 1, else 1. */
export function parsePage(raw: unknown): number {
  const n = typeof raw === "string" && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  return Math.max(1, n);
}

/** A release key ("scoring-taxonomy-items-narratives") as versions. Null unless it is one of `known`. */
export function releaseVersions(key: unknown, known: string[]): Versions | null {
  if (typeof key !== "string" || !known.includes(key)) return null;
  const [scoring, taxonomy, item_bank, narratives] = key.split("-");
  return { scoring, taxonomy, item_bank, narratives };
}

// ---------- List ----------

export interface ResponseListRaw {
  id: string;
  completed_on: string;
  outcome_type: string;
  outcome_reason: string | null;
  /** The first two perspectives in the stored ranking. */
  first: string | null;
  second: string | null;
  fit_rating: number | null;
  prediction_kind: string | null;
  prediction_perspectives: string[] | null;
  quick_check_shown: string | null;
  quick_check_perspective: string | null;
  quick_check_rating: number | null;
  answered: number;
  /** Every answer except free text, for the quality flags. */
  answers: Answers;
  timings_ms: Record<string, number>;
  /** bool_or(not withdrawn) over research_contacts for this response; null for no row. */
  research_active: boolean | null;
}

export interface ResponseListRow {
  id: string;
  date: string;
  result: string;
  fit: string;
  research: string;
  guessOrCheck: string;
  /** Yes, Close, No, or "–" with no guess (lib/admin/guess). */
  guessMatched: string;
  answered: number;
  /** "Too fast", "Same answer", both, or "". */
  check: string;
}

/** Names come from the response's own release where there is one; an unknown ID shows as itself. */
function namer(content: Content): (id: string | null | undefined) => string {
  const names = new Map(content.perspectives.perspectives.map((p) => [p.id, p.name]));
  return (id) => (id ? (names.get(id) ?? id) : "");
}

export function resultLabel(content: Content, r: { outcome_type: string; outcome_reason: string | null; first: string | null; second: string | null }): string {
  const name = namer(content);
  switch (r.outcome_type) {
    case "matched":
      return name(r.first);
    case "mixed_between":
      return `Between ${name(r.first)} and ${name(r.second)}`;
    case "mixed_unmatched":
      return "Own combination";
    case "undecided":
      return r.outcome_reason ? `Still forming (${r.outcome_reason})` : "Still forming";
    case "indifferent":
      return "Not a priority";
    default:
      return r.outcome_type;
  }
}

const GUESS: Record<string, string> = {
  own_combination: "own combination",
  forming: "still forming",
  not_priority: "not a priority",
  skipped: "skipped",
};

/** The guess, or the quick check, or "–" for neither (older responses, or a guess never shown). */
export function guessOrCheck(
  content: Content,
  copy: CopyFile,
  r: Pick<ResponseListRaw, "prediction_kind" | "prediction_perspectives" | "quick_check_shown" | "quick_check_perspective" | "quick_check_rating">,
): string {
  const parts: string[] = [];
  const guess = guessLabel(content, r);
  if (guess) parts.push(`Guess: ${guess}`);
  const check = quickCheckLabel(content, copy, r);
  if (check) parts.push(`Quick check ${check}`);
  return parts.length ? parts.join(" · ") : "–";
}

/** The guess before the result, or "" when none was asked or stored. */
function guessLabel(content: Content, r: Pick<ResponseListRaw, "prediction_kind" | "prediction_perspectives">): string {
  if (!r.prediction_kind) return "";
  const name = namer(content);
  const ids = r.prediction_perspectives ?? [];
  if (r.prediction_kind === "perspective") return name(ids[0]);
  if (r.prediction_kind === "between") return `between ${name(ids[0])} and ${name(ids[1])}`;
  return GUESS[r.prediction_kind] ?? r.prediction_kind;
}

/** "(own, Stewards): <rating>", or "" when the quick check wasn't shown. */
function quickCheckLabel(
  content: Content,
  copy: CopyFile,
  r: Pick<ResponseListRaw, "quick_check_shown" | "quick_check_perspective" | "quick_check_rating">,
): string {
  if (!r.quick_check_shown) return "";
  const rating = r.quick_check_rating ? (copy.quick_check.options[r.quick_check_rating - 1] ?? String(r.quick_check_rating)) : "not rated";
  return `(${r.quick_check_shown}, ${namer(content)(r.quick_check_perspective)}): ${rating}`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fitLabel(copy: CopyFile, rating: number | null): string {
  return rating ? `${rating} · ${copy.fit.options[rating - 1] ?? ""}` : "–";
}

/** Whether a row matches the result filter. */
export function matchesResult(r: Pick<ResponseListRaw, "outcome_type" | "first" | "second">, f: ResultFilter | null): boolean {
  if (!f) return true;
  if (r.outcome_type !== f.outcome_type) return false;
  if (f.outcome_type === "matched") return r.first === f.perspective;
  if (f.pair) return r.first !== null && r.second !== null && pairKey(r.first, r.second) === pairKey(...f.pair);
  return true;
}

export interface ListFilters {
  result: ResultFilter | null;
  research: ResearchFilter | null;
  check: CheckFilter | null;
}

/**
 * One page of the list: the release's rows (newest first) filtered, with each
 * row's quality flags judged against the whole release, and how many match.
 */
export function pageOfResponses(
  rows: ResponseListRaw[],
  content: Content,
  copy: CopyFile,
  filters: ListFilters,
  page: number,
): { rows: ResponseListRow[]; total: number; pairs: BetweenPair[] } {
  const statements = statementKeys(content);
  const releaseMedian = releaseMedianMs(rows.map((r) => totalMs(r.timings_ms)));
  const flags = new Map(rows.map((r) => [r.id, quality(statements, r, releaseMedian).flags]));
  const matching = rows.filter((r) => {
    if (!matchesResult(r, filters.result)) return false;
    if (filters.research === "yes" && r.research_active !== true) return false;
    if (filters.research === "no" && r.research_active === true) return false;
    const flagged = (flags.get(r.id) ?? []).length > 0;
    if (filters.check === "flagged" && !flagged) return false;
    if (filters.check === "clean" && flagged) return false;
    return true;
  });
  const shown = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ranked = (r: ResponseListRaw) => (r.first && r.second ? [{ id: r.first, distance: 0 }, { id: r.second, distance: 0 }] : []);
  const pairs = betweenPairs(content, rows.map((r) => ({ outcome_type: r.outcome_type, ranked: ranked(r) })));
  return { rows: buildResponseList(shown, content, copy, flags), total: matching.length, pairs };
}

export function buildResponseList(
  rows: ResponseListRaw[],
  content: Content,
  copy: CopyFile,
  flags: Map<string, QualityFlag[]> = new Map(),
): ResponseListRow[] {
  return rows.map((r) => ({
    id: r.id,
    date: r.completed_on,
    result: resultLabel(content, r),
    fit: fitLabel(copy, r.fit_rating),
    research: researchLabel(r.research_active),
    guessOrCheck: guessOrCheck(content, copy, r),
    guessMatched: guessMatchLabel(guessMatch(r)),
    answered: r.answered,
    check: flagsLabel(flags.get(r.id) ?? []),
  }));
}

// ---------- Detail ----------

export interface ResponseDetailRaw {
  id: string;
  completed_on: string;
  scoring_version: string;
  taxonomy_version: string;
  item_bank_version: string;
  narratives_version: string;
  sequence_version: string;
  form: string;
  seed: string;
  answer_direction: string;
  /** Every answer except free text. */
  answers: Answers;
  /** The free-text answers (string answers), unmasked: masked by buildResponseDetail. */
  free_text: Record<string, string>;
  result: ScoreResult;
  timings_ms: Record<string, number>;
  fit_rating: number | null;
  better_fit: string | null;
  track_checks: Record<string, string>;
  /** Item ID → how many times it was changed on the results page. */
  answer_changes: Record<string, number>;
  compared_with: string | null;
  /** This response's research_contacts rows: when, and whether withdrawn. Never the email. */
  research: { created_on: string; withdrawn: boolean }[];
  /** Feedback with this response_id, oldest first. `has_email` only, never the address. */
  feedback: { created_on: string; type: string; may_quote: boolean; body: string; has_email: boolean }[];
  prediction_kind: string | null;
  prediction_perspectives: string[] | null;
  quick_check_shown: string | null;
  quick_check_perspective: string | null;
  quick_check_rating: number | null;
}

export interface ResponseDetail {
  id: string;
  date: string;
  versions: { label: string; value: string }[];
  outcome: string;
  ranked: { name: string; distance: string }[];
  answers: { key: string; text: string; value: string; label: string }[];
  skipped: { key: string; text: string }[];
  /** "What they told us", in the order they told us. */
  told: { label: string; value: string; href?: string }[];
  /** Feedback sent with this response attached. Text masked. */
  feedback: { date: string; type: string; quote: string; email: string; body: string }[];
  direction: string;
  seed: string;
  /** Total time, median per scored statement and any quality flags (issue #55). */
  timing: string;
}

const CHECKS: Record<string, string> = { about_right: "about right", further_low: "further toward the low end", further_high: "further toward the high end" };

/** Every answer key of a form, in its listed (canonical, unshuffled) order. */
export function canonicalKeys(content: Content, formId: string): string[] {
  const f = content.items.forms[formId];
  if (!f) return [];
  return [
    ...f.intro,
    ...f.blocks.flatMap((b) => [...(f.pinned_before_block[b.construct] ?? []), ...b.items, `${b.confidence_probe}:${b.construct}`]),
    ...f.after_blocks,
    ...f.outro,
  ];
}

/** The option label the person tapped (answers are stored canonically, so direction doesn't change it). */
export function answerLabel(content: Content, item: Item, v: AnswerValue): string {
  switch (item.format) {
    case "L7":
      return content.items.likert_labels[(v as number) - 1] ?? String(v);
    case "SC":
    case "CAT":
      return item.options[v as number] ?? String(v);
    case "TO": {
      const t = v as TradeoffAnswer;
      const strength = content.items.tradeoff_strength_labels[t.strength === "strongly" ? 1 : 0];
      return `${item.options[t.choice] ?? t.choice} (${strength})`;
    }
    case "GRID":
      return Object.entries(v as Record<string, number>)
        .map(([row, i]) => `${row}: ${item.options[i] ?? i}`)
        .join("; ");
    case "TXT":
      // Never shown; the query doesn't read it. Kept here so the switch is complete.
      return "";
  }
}

function rawValue(v: AnswerValue): string {
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return "";
  if ("choice" in v) return `${v.choice} · ${v.strength}`;
  return Object.values(v).join(", ");
}

/** "Check your six answers", one line per theme, named as the content names it. */
export function trackChecksLines(content: Content, checks: Record<string, string>): string[] {
  return Object.entries(checks ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${content.narratives.constructs[k]?.name ?? k}: ${CHECKS[v] ?? v}`);
}

/** Answers changed on the results page: how many in all, then each item and how many times, most first. */
export function answerChangesLine(changes: Record<string, number>): string {
  const entries = Object.entries(changes ?? {})
    .filter(([, n]) => n > 0)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  if (entries.length === 0) return "–";
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return `${countOf(total, "change", "changes")}: ${entries.map(([k, n]) => `${k} (${n})`).join(", ")}`;
}

/** "Opted in on <date>" with an active row, "Withdrawn" when all are withdrawn, "No" with none. */
export function researchFollowUp(rows: ResponseDetailRaw["research"]): string {
  const active = rows.filter((r) => !r.withdrawn).map((r) => r.created_on).sort();
  if (active.length) return `Opted in on ${active[0]}`;
  return rows.length ? "Withdrawn" : "No";
}

/** "12 min 4 s in all · 9 s per statement (median) · Too fast". `releaseMedian` from releaseMedianMs. */
export function timingLine(content: Content, raw: Pick<ResponseDetailRaw, "answers" | "timings_ms">, releaseMedian: number | null): string {
  const q = quality(statementKeys(content), raw, releaseMedian);
  const parts = [`${duration(q.totalMs)} in all`, q.medianStatementMs === null ? "no statements timed" : `${duration(q.medianStatementMs)} per statement (median)`];
  parts.push(q.flags.length ? `flagged: ${flagsLabel(q.flags)}` : "not flagged");
  return parts.join(" · ");
}

export function buildResponseDetail(raw: ResponseDetailRaw, content: Content, copy: CopyFile, releaseMedian: number | null = null): ResponseDetail {
  const name = namer(content);
  const o = raw.result.outcome;
  const keys = canonicalKeys(content, raw.form);
  const answers: ResponseDetail["answers"] = [];
  const skipped: ResponseDetail["skipped"] = [];
  for (const key of keys) {
    const item = content.itemsById.get(key.split(":")[0]);
    if (!item || item.format === "TXT") continue;
    const v = raw.answers[key];
    if (v === undefined) skipped.push({ key, text: itemText(content, key) });
    else answers.push({ key, text: itemText(content, key), value: rawValue(v), label: answerLabel(content, item, v) });
  }
  const better = raw.better_fit === "none" ? "None of these" : raw.better_fit === "own_mix" ? "My own mix" : name(raw.better_fit);
  const checks = trackChecksLines(content, raw.track_checks);
  const freeText = Object.values(raw.free_text ?? {})
    .map((t) => maskEmails(t).trim())
    .filter(Boolean);
  const typeLabel = (id: string) => copy.feedback.problem_options.find((o) => o.id === id)?.label ?? id;

  return {
    id: raw.id,
    date: raw.completed_on,
    versions: [
      { label: "Scoring", value: raw.scoring_version },
      { label: "Taxonomy", value: raw.taxonomy_version },
      { label: "Item bank", value: raw.item_bank_version },
      { label: "Narratives", value: raw.narratives_version },
      { label: "Sequence", value: raw.sequence_version },
      { label: "Form", value: raw.form },
    ],
    outcome: resultLabel(content, {
      outcome_type: o.type,
      outcome_reason: o.type === "undecided" ? o.reason : null,
      first: o.ranked[0]?.id ?? null,
      second: o.ranked[1]?.id ?? null,
    }),
    ranked: o.ranked.map((r) => ({ name: name(r.id), distance: r.distance.toFixed(3) })),
    answers,
    skipped,
    told: [
      { label: "Guess before the result", value: capitalise(guessLabel(content, raw)) || "–" },
      { label: "Quick check", value: quickCheckLabel(content, copy, raw) || "–" },
      { label: "Does this fit you?", value: fitLabel(copy, raw.fit_rating) },
      { label: "Which fits you better?", value: raw.better_fit ? better : "–" },
      { label: "Check your six answers", value: checks.length ? checks.join("\n") : "–" },
      { label: "Answers changed on the results page", value: answerChangesLine(raw.answer_changes) },
      { label: "Free text", value: freeText.length ? freeText.join("\n\n") : "–" },
      raw.compared_with
        ? { label: "Compared with", value: raw.compared_with, href: `/admin/responses/${raw.compared_with}` }
        : { label: "Compared with", value: "–" },
      { label: "Research follow-up", value: researchFollowUp(raw.research ?? []) },
    ],
    feedback: (raw.feedback ?? []).map((f) => ({
      date: f.created_on,
      type: typeLabel(f.type),
      quote: f.may_quote ? "Yes" : "No",
      email: f.has_email ? "Yes" : "No",
      body: maskEmails(f.body),
    })),
    direction: raw.answer_direction === "agree_first" ? "Agree first" : "Disagree first",
    seed: raw.seed,
    timing: timingLine(content, raw, releaseMedian),
  };
}

// Single responses for the admin pages (/admin/responses, issue #37): the
// filters in the URL, and the rows lib/db/admin.ts reads turned into what the
// list and detail pages show. Pure, so it can be tested without a database.
//
// Never an email, the free-text answer or feedback text: the database query
// leaves free text out (it reads only whether there was one), and rows are
// copied field by field, never spread.
import type { Content, Item, Versions } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";
import type { Answers, AnswerValue, ScoreResult, TradeoffAnswer } from "@/lib/scoring";
import { itemText } from "./index";

export const PAGE_SIZE = 50;

/** What the result filter can be set to: a closest perspective, or one of the other outcomes. */
export type ResultFilter = { outcome_type: "matched"; perspective: string } | { outcome_type: Exclude<OutcomeKey, "matched">; perspective: null };

type OutcomeKey = "matched" | "mixed_between" | "mixed_unmatched" | "undecided" | "indifferent";

const OTHER_OUTCOMES: { value: string; outcome_type: Exclude<OutcomeKey, "matched">; label: string }[] = [
  { value: "between", outcome_type: "mixed_between", label: "In between" },
  { value: "own_combination", outcome_type: "mixed_unmatched", label: "Own combination" },
  { value: "forming", outcome_type: "undecided", label: "Still forming" },
  { value: "not_priority", outcome_type: "indifferent", label: "Not a priority" },
];

/** The options for the result filter, perspectives first, in their listed order. */
export function resultFilterOptions(content: Content): { value: string; label: string }[] {
  return [
    ...content.perspectives.perspectives.map((p) => ({ value: p.id, label: p.name })),
    ...OTHER_OUTCOMES.map(({ value, label }) => ({ value, label })),
  ];
}

/** `?result=` from the URL, or null for "all" (and for anything unknown). */
export function parseResultFilter(raw: unknown, content: Content): ResultFilter | null {
  if (typeof raw !== "string" || raw === "") return null;
  const other = OTHER_OUTCOMES.find((o) => o.value === raw);
  if (other) return { outcome_type: other.outcome_type, perspective: null };
  return content.perspectives.perspectives.some((p) => p.id === raw) ? { outcome_type: "matched", perspective: raw } : null;
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
}

export interface ResponseListRow {
  id: string;
  date: string;
  result: string;
  fit: string;
  guessOrCheck: string;
  answered: number;
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
  const name = namer(content);
  const parts: string[] = [];
  if (r.prediction_kind) {
    const ids = r.prediction_perspectives ?? [];
    const guess =
      r.prediction_kind === "perspective"
        ? name(ids[0])
        : r.prediction_kind === "between"
          ? `between ${name(ids[0])} and ${name(ids[1])}`
          : (GUESS[r.prediction_kind] ?? r.prediction_kind);
    parts.push(`Guess: ${guess}`);
  }
  if (r.quick_check_shown) {
    const rating = r.quick_check_rating ? (copy.quick_check.options[r.quick_check_rating - 1] ?? String(r.quick_check_rating)) : "not rated";
    parts.push(`Quick check (${r.quick_check_shown}, ${name(r.quick_check_perspective)}): ${rating}`);
  }
  return parts.length ? parts.join(" · ") : "–";
}

function fitLabel(copy: CopyFile, rating: number | null): string {
  return rating ? `${rating} · ${copy.fit.options[rating - 1] ?? ""}` : "–";
}

export function buildResponseList(rows: ResponseListRaw[], content: Content, copy: CopyFile): ResponseListRow[] {
  return rows.map((r) => ({
    id: r.id,
    date: r.completed_on,
    result: resultLabel(content, r),
    fit: fitLabel(copy, r.fit_rating),
    guessOrCheck: guessOrCheck(content, copy, r),
    answered: r.answered,
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
  /** Every answer except free text, which the query never reads. */
  answers: Answers;
  free_text_answered: boolean;
  result: ScoreResult;
  fit_rating: number | null;
  better_fit: string | null;
  track_checks: Record<string, string>;
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
  freeText: string;
  guessOrCheck: string;
  fit: { label: string; value: string }[];
  direction: string;
  seed: string;
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

export function buildResponseDetail(raw: ResponseDetailRaw, content: Content, copy: CopyFile): ResponseDetail {
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
  const checks = Object.entries(raw.track_checks ?? {}).map(([k, v]) => `${k}: ${CHECKS[v] ?? v}`);

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
    freeText: raw.free_text_answered ? "Free text: answered" : "Free text: not answered",
    guessOrCheck: guessOrCheck(content, copy, raw),
    fit: [
      { label: "Does this fit you?", value: fitLabel(copy, raw.fit_rating) },
      { label: "Which fits you better?", value: raw.better_fit ? better : "–" },
      { label: "Check your six answers", value: checks.length ? checks.join("; ") : "–" },
    ],
    direction: raw.answer_direction === "agree_first" ? "Agree first" : "Disagree first",
    seed: raw.seed,
  };
}

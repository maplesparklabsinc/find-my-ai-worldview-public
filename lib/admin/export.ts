// "Download data" on /admin (issue #55, section 1): anonymous responses and
// feedback as CSV in one zip, built on request and never stored, so the founder
// can hand the file to Claude and ask questions. Pure apart from zipping.
//
// Never an email address: lib/db/admin.ts never reads an email column for it,
// free text and feedback text are masked here (issue #51), and research_contacts
// is only "yes", "withdrawn" or "no". Never a submission key or edit token, and
// no construct scores: themes are bands only.
import { strToU8, zipSync } from "fflate";
import type { BandId, Content } from "@/lib/content";
import type { Answers, AnswerValue } from "@/lib/scoring";
import { guessMatch } from "./guess";
import { itemText } from "./index";
import { maskEmails } from "./mask";
import { quality, releaseMedianMs, statementKeys, totalMs, type QualityFlag } from "./quality";
import { canonicalKeys } from "./responses";

export interface ExportResponseRaw {
  id: string;
  completed_on: string;
  scoring_version: string;
  taxonomy_version: string;
  item_bank_version: string;
  narratives_version: string;
  form: string;
  answer_direction: string;
  /** Every answer except free text. */
  answers: Answers;
  /** Free-text answers, unmasked: masked here. */
  free_text: Record<string, string>;
  timings_ms: Record<string, number>;
  outcome_type: string;
  outcome_reason: string | null;
  closest_perspective: string | null;
  /** The first two perspectives in the stored ranking (IDs only). */
  first: string | null;
  second: string | null;
  bands: Record<string, BandId | null>;
  country: string | null;
  fit_rating: number | null;
  better_fit: string | null;
  track_checks: Record<string, string>;
  prediction_kind: string | null;
  prediction_perspectives: string[] | null;
  quick_check_shown: string | null;
  quick_check_perspective: string | null;
  quick_check_rating: number | null;
  compared_with: string | null;
  /** bool_or(not withdrawn) over the response's research rows; null for none. */
  research_active: boolean | null;
}

export interface ExportFeedbackRaw {
  created_on: string;
  type: string;
  item_ids: string[];
  perspective_ids: string[];
  body: string;
  may_quote: boolean;
  response_id: string | null;
  has_email: boolean;
}

/** Spreadsheet apps run a cell that starts with one of these as a formula. */
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (typeof v === "string" && FORMULA.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const csvLine = (cells: unknown[]) => cells.map(csvCell).join(",");

/** An answer as stored: a number, or JSON for trade-offs and grids. */
function answerCell(v: AnswerValue | undefined): string | number | null {
  if (v === undefined) return null;
  return typeof v === "number" || typeof v === "string" ? v : JSON.stringify(v);
}

const researchCell = (active: boolean | null) => (active === null ? "no" : active ? "yes" : "withdrawn");

interface Column {
  name: string;
  about: string;
  value: (r: ExportResponseRaw, flags: QualityFlag[], ms: { total: number; median: number | null }) => unknown;
}

/** Item answer columns: the current form's items in canonical order, then any other keys found, sorted. */
export function itemColumns(content: Content, rows: ExportResponseRaw[]): string[] {
  const canonical = canonicalKeys(content, content.config.form);
  const seen = new Set(rows.flatMap((r) => [...Object.keys(r.answers ?? {}), ...Object.keys(r.free_text ?? {})]));
  const extra = [...seen].filter((k) => !canonical.includes(k)).sort();
  return [...canonical, ...extra];
}

export function responseColumns(content: Content, rows: ExportResponseRaw[]): Column[] {
  const items: Column[] = itemColumns(content, rows).map((key) => {
    const item = content.itemsById.get(key.split(":")[0]);
    const free = item?.format === "TXT";
    return {
      name: key,
      about: `${free ? "Free text, email addresses replaced with [email removed]" : "Answer as stored"}: ${itemText(content, key) || key}`,
      value: (r) => (free ? (r.free_text?.[key] ? maskEmails(r.free_text[key]) : null) : answerCell(r.answers?.[key])),
    };
  });
  const bands: Column[] = content.config.scored_constructs.map((c) => ({
    name: `band_${c}`,
    about: `Band on "${content.narratives.constructs[c]?.question ?? c}" (strong_low, lean_low, between, lean_high, strong_high; empty if not placed). No scores.`,
    value: (r) => r.bands?.[c] ?? null,
  }));
  const between = (r: ExportResponseRaw) => (r.outcome_type === "mixed_between" && r.first && r.second ? [r.first, r.second].sort() : null);
  return [
    { name: "id", about: "Response ID (the result link is /r/<id>)", value: (r) => r.id },
    { name: "completed_on", about: "Date completed (UTC), never a time", value: (r) => r.completed_on },
    { name: "scoring_version", about: "Scoring version", value: (r) => r.scoring_version },
    { name: "taxonomy_version", about: "Taxonomy (perspectives) version", value: (r) => r.taxonomy_version },
    { name: "item_bank_version", about: "Item bank version", value: (r) => r.item_bank_version },
    { name: "narratives_version", about: "Narratives version", value: (r) => r.narratives_version },
    { name: "form", about: "Form ID", value: (r) => r.form },
    { name: "answer_direction", about: "disagree_first or agree_first (answers are stored the same way either way)", value: (r) => r.answer_direction },
    ...items,
    { name: "outcome_type", about: "matched, mixed_between, mixed_unmatched, undecided or indifferent", value: (r) => r.outcome_type },
    { name: "outcome_reason", about: "For undecided: coverage, confidence or middle", value: (r) => r.outcome_reason },
    { name: "closest_perspective", about: "Closest perspective ID", value: (r) => r.closest_perspective },
    { name: "between_1", about: "In between results only: the first of the two perspective IDs (alphabetical)", value: (r) => between(r)?.[0] ?? null },
    { name: "between_2", about: "In between results only: the second of the two perspective IDs", value: (r) => between(r)?.[1] ?? null },
    ...bands,
    { name: "country", about: "Country code from D11, empty if not answered or somewhere else", value: (r) => r.country },
    { name: "fit_rating", about: '"Does this fit you?", 1 to 5', value: (r) => r.fit_rating },
    { name: "better_fit", about: '"Which fits you better?": a perspective ID, none or own_mix', value: (r) => r.better_fit },
    { name: "track_checks", about: '"Check your six answers": JSON, construct -> about_right, further_low or further_high', value: (r) => (Object.keys(r.track_checks ?? {}).length ? r.track_checks : null) },
    { name: "guess", about: "The guess before the result: perspective, between, own_combination, forming, not_priority or skipped", value: (r) => r.prediction_kind },
    {
      name: "guess_matched",
      about: "Whether the result matched the guess: yes, close (one of the two perspectives of an In between result, or the reverse), no, or empty with no guess",
      value: (r) => guessMatch(r),
    },
    { name: "guess_perspectives", about: "The perspective IDs guessed, separated by a space", value: (r) => r.prediction_perspectives?.join(" ") ?? null },
    { name: "quick_check_shown", about: "Quick check: own or other description shown", value: (r) => r.quick_check_shown },
    { name: "quick_check_perspective", about: "Quick check: the perspective ID shown", value: (r) => r.quick_check_perspective },
    { name: "quick_check_rating", about: "Quick check rating, 1 to 5", value: (r) => r.quick_check_rating },
    { name: "compared_with", about: "The response ID this person compared with, if they came from a compare link", value: (r) => r.compared_with },
    { name: "research", about: "Left an email for research: yes, withdrawn or no (the email itself is never exported)", value: (r) => researchCell(r.research_active) },
    { name: "total_seconds", about: "Total time on the questions, in seconds", value: (_r, _f, ms) => Math.round(ms.total / 1000) },
    { name: "median_statement_seconds", about: "Median time per scored statement, in seconds", value: (_r, _f, ms) => (ms.median === null ? null : Math.round(ms.median / 100) / 10) },
    { name: "flag_too_fast", about: "Flagged too fast (see the admin page for the rule): yes or no", value: (_r, f) => (f.includes("too_fast") ? "yes" : "no") },
    { name: "flag_same_answer", about: "Flagged as the same answer to 90% or more of the scored statements: yes or no", value: (_r, f) => (f.includes("same_answer") ? "yes" : "no") },
  ];
}

const FEEDBACK_COLUMNS: { name: string; about: string; value: (f: ExportFeedbackRaw) => unknown }[] = [
  { name: "created_on", about: "Date sent (UTC)", value: (f) => f.created_on },
  { name: "type", about: "Problem type ID", value: (f) => f.type },
  { name: "item_ids", about: "Question IDs it is about, separated by a space", value: (f) => f.item_ids.join(" ") },
  { name: "perspective_ids", about: "Perspective IDs it is about, separated by a space", value: (f) => f.perspective_ids.join(" ") },
  { name: "text", about: "What they wrote, with email addresses replaced with [email removed]", value: (f) => maskEmails(f.body) },
  { name: "may_quote", about: "May quote without their name: yes or no", value: (f) => (f.may_quote ? "yes" : "no") },
  { name: "response_id", about: "The result attached, if any", value: (f) => f.response_id },
  { name: "left_an_email", about: "Left an email to reply to: yes or no (the email itself is never exported)", value: (f) => (f.has_email ? "yes" : "no") },
];

/** Flags and times for each row, judged against the median of its own release. */
function rowQuality(content: Content, rows: ExportResponseRaw[]) {
  const statements = statementKeys(content);
  const release = (r: ExportResponseRaw) => [r.scoring_version, r.taxonomy_version, r.item_bank_version, r.narratives_version].join("-");
  const totals = new Map<string, number[]>();
  for (const r of rows) totals.set(release(r), [...(totals.get(release(r)) ?? []), totalMs(r.timings_ms)]);
  const medians = new Map([...totals].map(([k, t]) => [k, releaseMedianMs(t)]));
  return rows.map((r) => quality(statements, r, medians.get(release(r)) ?? null));
}

export interface ExportFiles {
  "responses.csv": string;
  "feedback.csv": string;
  "README.txt": string;
}

export function buildExport(
  content: Content,
  responses: ExportResponseRaw[],
  feedback: ExportFeedbackRaw[],
  about: { date: string; release: string; from: string | null; to: string | null },
): ExportFiles {
  const cols = responseColumns(content, responses);
  const q = rowQuality(content, responses);
  const responsesCsv = [
    csvLine(cols.map((c) => c.name)),
    ...responses.map((r, i) => csvLine(cols.map((c) => c.value(r, q[i].flags, { total: q[i].totalMs, median: q[i].medianStatementMs })))),
  ].join("\r\n");
  const feedbackCsv = [csvLine(FEEDBACK_COLUMNS.map((c) => c.name)), ...feedback.map((f) => csvLine(FEEDBACK_COLUMNS.map((c) => c.value(f))))].join("\r\n");
  const range = about.from || about.to ? `${about.from ?? "the start"} to ${about.to ?? "today"}` : "all dates";
  const readme = [
    `Find My AI Worldview: anonymous data, downloaded ${about.date}.`,
    "Self-selected respondents; not representative.",
    `Content release: ${about.release}. Completion dates: ${range}.`,
    `${responses.length} responses, ${feedback.length} feedback entries. No email addresses, names or IP addresses. Question text is from the current content.`,
    "",
    "responses.csv, one row per completed quiz:",
    ...cols.map((c) => `${c.name}: ${c.about}`),
    "",
    "feedback.csv, one row per feedback entry:",
    ...FEEDBACK_COLUMNS.map((c) => `${c.name}: ${c.about}`),
    "",
  ].join("\r\n");
  return { "responses.csv": responsesCsv + "\r\n", "feedback.csv": feedbackCsv + "\r\n", "README.txt": readme };
}

export function zipExport(files: ExportFiles): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])), { level: 6 });
}

/** `?from=` and `?to=`: a YYYY-MM-DD date, else null. */
export function parseDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? null : raw;
}

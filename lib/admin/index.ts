// The admin page (/admin, issue #14): turns the aggregate rows lib/db/admin.ts
// reads into what the page shows. Pure, so it can be tested without a database.
//
// Only fields named here reach the page: rows are copied field by field, never
// spread, so a stray column (an email, an answer) can't leak through.
import type { Content, Versions } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";

/** Groups smaller than this are marked "read lightly". */
export const FEW = 30;
/** A share above this is flagged. */
export const FLAG = 0.3;
export const DAYS = 30;
/** "Rules for low-risk AI": collected, not scored (item bank 0.6.0, issue #33; reworded in 0.7.0, issue #35). */
export const RULES_DEPEND_ITEM = "CX-T1";

export interface AdminRaw {
  /** The database's current date, YYYY-MM-DD (UTC on Supabase). */
  today: string;
  totals: { today: number; last_7_days: number; all_time: number };
  research_active: number;
  /** Completions per day, any order, possibly with gaps. */
  daily: { day: string; n: number }[];
  /** The rest are for the current content release only. */
  outcomes: { outcome_type: string; perspective: string | null; n: number }[];
  /** Results with a fit rating: perspective (null for every outcome but matched), rating 1..5, count. */
  fit: { perspective: string | null; rating: number; n: number }[];
  better_fit: { perspective: string | null; pick: string; n: number }[];
  /** Answers to RULES_DEPEND_ITEM by result (perspective only for matched): choice 0 = leave low-risk AI mostly alone, 1 = basic rules for all AI. */
  rules_depend: { outcome_type: string; perspective: string | null; choice: number; strength: string; n: number }[];
  /** Construct ID, 'about_right' | 'further_low' | 'further_high', count. */
  tracks: { construct: string; answer: string; n: number }[];
  /** Highest skip rates on the current item bank, highest first. */
  skips: { item: string; skip_rate: number }[];
  /** Most changed answers on the current item bank, most first. */
  changes: { item: string; total_changes: number }[];
  feedback: {
    created_on: string;
    type: string;
    item_ids: string[];
    perspective_ids: string[];
    body: string;
    may_quote: boolean;
    response_id: string | null;
    /** The attachment came with the result's edit token. */
    attached_verified: boolean;
    has_email: boolean;
  }[];
  feedback_last_7_days: number;
}

export interface Dashboard {
  versions: string;
  totals: { today: number; week: number; allTime: number; research: number; researchShare: string };
  days: { date: string; label: string; n: number; today: boolean }[];
  dayMax: number;
  daySummary: string;
  peak: string | null;
  outcomes: { name: string; n: number; pct: string; width: number; named: boolean }[];
  outcomesTotal: number;
  fit: { name: string; n: number; well: string; poor: string; poorFlag: boolean; few: boolean; picked: string }[];
  rulesDepend: { name: string; n: number; depends: string; strongly: string; few: boolean; named: boolean }[];
  tracks: {
    question: string;
    low: string;
    high: string;
    n: number;
    ok: string;
    further_low: string;
    further_high: string;
    lowFlag: boolean;
    highFlag: boolean;
    few: boolean;
  }[];
  skipped: { id: string; text: string; value: string }[];
  changed: { id: string; text: string; value: string }[];
  feedback: {
    date: string;
    type: string;
    about: string;
    body: string;
    result: string | null;
    resultLabel: string;
    quote: string;
    reply: string;
  }[];
  feedbackWeek: number;
}

/** Outcomes other than a named perspective, in the order the page lists them. */
const OTHER_OUTCOMES: [string, string][] = [
  ["mixed_between", "In between"],
  ["undecided", "Still forming"],
  ["mixed_unmatched", "Your own combination"],
  ["indifferent", "Not a priority"],
];

const DEPEND_OTHER_OUTCOMES: [string, string][] = [
  ["mixed_between", "In between"],
  ["mixed_unmatched", "Your own combination"],
  ["undecided", "Still forming"],
  ["indifferent", "Not a priority"],
];

const nf = new Intl.NumberFormat("en-CA");
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/** "1 person", "2 people": the noun for a count shown on the admin pages (issue #46). */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** A formatted count with its noun: "1 person", "1,204 people". */
export function countOf(n: number, one: string, many: string): string {
  return `${nf.format(n)} ${plural(n, one, many)}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function versionsLine(v: Versions): string {
  return [v.scoring, v.taxonomy, v.item_bank, v.narratives].join(" · ");
}

export function buildDashboard(raw: AdminRaw, content: Content, copy: CopyFile, versions: Versions): Dashboard {
  const perspectives = content.perspectives.perspectives;
  const pname = (id: string) => perspectives.find((p) => p.id === id)?.name ?? id;

  // Totals -------------------------------------------------------------------
  const t = raw.totals;
  const totals = {
    today: t.today,
    week: t.last_7_days,
    allTime: t.all_time,
    research: raw.research_active,
    researchShare: pct(raw.research_active, t.all_time),
  };

  // Completions per day: the last 30 days, ending today, gaps as 0 ------------
  const byDay = new Map(raw.daily.map((d) => [d.day, d.n]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(raw.today, i - (DAYS - 1));
    return { date, label: dayLabel(date), n: byDay.get(date) ?? 0, today: i === DAYS - 1 };
  });
  const dayTotal = days.reduce((s, d) => s + d.n, 0);
  const top = days.reduce((a, b) => (b.n > a.n ? b : a), days[0]);
  const peak = top.n > 0 ? `${top.label} (${nf.format(top.n)})` : null;
  const daySummary =
    dayTotal === 0
      ? "Completed quizzes per day over the last 30 days: none yet."
      : `Completed quizzes per day over the last 30 days, ${nf.format(dayTotal)} in total. ` +
        `The busiest day was ${top.label} with ${nf.format(top.n)}; ${nf.format(days[DAYS - 1].n)} so far today.`;

  // Results people got --------------------------------------------------------
  const count = (type: string, perspective?: string) =>
    raw.outcomes
      .filter((o) => o.outcome_type === type && (perspective === undefined || o.perspective === perspective))
      .reduce((s, o) => s + o.n, 0);
  const named = perspectives
    .map((p) => ({ name: p.name, n: count("matched", p.id), named: true }))
    .sort((a, b) => b.n - a.n);
  const others = OTHER_OUTCOMES.map(([type, name]) => ({ name, n: count(type), named: false }));
  const outcomeRows = [...named, ...others];
  const outcomesTotal = raw.outcomes.reduce((s, o) => s + o.n, 0);
  const maxOutcome = Math.max(0, ...outcomeRows.map((o) => o.n));
  const outcomes = outcomeRows.map((o) => ({
    ...o,
    pct: pct(o.n, outcomesTotal),
    width: maxOutcome > 0 ? o.n / maxOutcome : 0,
  }));

  // Does the result fit? --------------------------------------------------------
  const pickName = (pick: string) =>
    pick === "none" ? copy.fit.better_none : pick === "own_mix" ? copy.fit.better_own_mix : pname(pick);
  // One row per named perspective, then one for every other outcome together.
  const fitRow = (name: string, perspective: string | null) => {
    const rows = raw.fit.filter((f) => f.perspective === perspective);
    const n = rows.reduce((s, f) => s + f.n, 0);
    const well = rows.filter((f) => f.rating >= 4).reduce((s, f) => s + f.n, 0);
    const poor = rows.filter((f) => f.rating <= 2).reduce((s, f) => s + f.n, 0);
    const picks = raw.better_fit
      .filter((b) => b.perspective === perspective)
      .sort((a, b) => b.n - a.n || a.pick.localeCompare(b.pick));
    return {
      name,
      n,
      well: pct(well, n),
      poor: pct(poor, n),
      poorFlag: n > 0 && poor / n > FLAG,
      few: n < FEW,
      picked: picks[0] ? pickName(picks[0].pick) : "–",
    };
  };
  const fit = [...perspectives.map((p) => fitRow(p.name, p.id)), fitRow("Other results", null)].filter((f) => f.n > 0);

  // Rules for low-risk AI (CX-T1) ---------------------------------------------------
  // Each perspective (closest, for matched), then the other outcomes, as listed in issue #33.
  const dependRow = (name: string, type: string, perspective: string | null, named: boolean) => {
    const rows = raw.rules_depend.filter((r) => r.outcome_type === type && r.perspective === perspective);
    const n = rows.reduce((s, r) => s + r.n, 0);
    const depends = rows.filter((r) => r.choice === 0);
    return {
      name,
      n,
      depends: pct(depends.reduce((s, r) => s + r.n, 0), n),
      strongly: pct(depends.filter((r) => r.strength === "strongly").reduce((s, r) => s + r.n, 0), n),
      few: n < FEW,
      named,
    };
  };
  const rulesDepend = [
    ...perspectives.map((p) => dependRow(p.name, "matched", p.id, true)),
    ...DEPEND_OTHER_OUTCOMES.map(([type, name]) => dependRow(name, type, null, false)),
  ].filter((r) => r.n > 0);

  // Where people say we placed them wrong ----------------------------------------
  const anyChecks = raw.tracks.some((r) => r.n > 0);
  const tracks = anyChecks
    ? content.config.scored_constructs.map((c) => {
        const rows = raw.tracks.filter((r) => r.construct === c);
        const of = (a: string) => rows.filter((r) => r.answer === a).reduce((s, r) => s + r.n, 0);
        const n = rows.reduce((s, r) => s + r.n, 0);
        const lo = of("further_low");
        const hi = of("further_high");
        const nar = content.narratives.constructs[c];
        return {
          question: nar.question,
          low: nar.low,
          high: nar.high,
          n,
          ok: pct(of("about_right"), n),
          further_low: pct(lo, n),
          further_high: pct(hi, n),
          lowFlag: n > 0 && lo / n > FLAG,
          highFlag: n > 0 && hi / n > FLAG,
          few: n < FEW,
        };
      })
    : [];

  // Questions to look at --------------------------------------------------------
  const skipped = raw.skips.slice(0, 5).map((s) => ({
    id: s.item,
    text: itemText(content, s.item),
    value: `${Math.round(s.skip_rate * 100)}%`,
  }));
  const changed = raw.changes.slice(0, 3).map((c) => ({
    id: c.item,
    text: itemText(content, c.item),
    value: c.total_changes === 1 ? "once" : `${nf.format(c.total_changes)} times`,
  }));

  // Feedback ----------------------------------------------------------------------
  const typeLabel = (id: string) => copy.feedback.problem_options.find((o) => o.id === id)?.label ?? id;
  const feedback = raw.feedback.map((f) => ({
    date: dayLabel(f.created_on),
    type: typeLabel(f.type),
    about: [...f.item_ids, ...f.perspective_ids.map(pname)].join(", "),
    body: f.body,
    result: f.response_id ? `/r/${f.response_id}` : null,
    resultLabel: f.attached_verified ? "Their result" : "Attached result (unverified)",
    quote: f.may_quote ? "Yes" : "No",
    reply: f.has_email ? "Email given" : "No",
  }));

  return {
    versions: versionsLine(versions),
    totals,
    days,
    dayMax: Math.max(0, ...days.map((d) => d.n)),
    daySummary,
    peak,
    outcomes,
    outcomesTotal,
    fit,
    rulesDepend,
    tracks,
    skipped,
    changed,
    feedback,
    feedbackWeek: raw.feedback_last_7_days,
  };
}

/** An item's short text, or its stem. Confidence probes ("D3:C1") name their question. */
export function itemText(content: Content, key: string): string {
  const [id, construct] = key.split(":");
  const item = content.itemsById.get(id);
  if (!item) return "";
  const text = item.short ?? item.stem;
  const q = construct ? content.narratives.constructs[construct]?.question : undefined;
  return q ? `${text} (${q})` : text;
}

/** A round axis maximum for the per-day chart, with a whole-number midpoint. */
export function niceMax(n: number): number {
  if (n <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * step >= n) return m * step;
  return 10 * step;
}

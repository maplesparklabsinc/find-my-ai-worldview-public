// The dashboard cards added in issue #55 that need single responses: how people
// spread across each theme, question health, how well each perspective fits,
// "In between" pairs and the research setup check. lib/db/admin.ts reads the
// current release's responses (never free text or an email), and everything
// here is worked out from those rows. Pure.
//
// Never a construct score or distance for a person: bands are counted across
// people, and the runner-up gap is reported only as clear / close / very close.
import type { BandId, Content } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";
import { buildSequence } from "@/lib/form";
import type { Answers } from "@/lib/scoring";
import { FEW, countOf } from "./index";
import { quality, releaseMedianMs, statementKeys, totalMs, type QualityFlag } from "./quality";

/** One response of the current release, as the cards need it. */
export interface AdminRow {
  id: string;
  completed_on: string;
  form: string;
  seed: number;
  answer_direction: string;
  /** Every answer except free text. */
  answers: Answers;
  timings_ms: Record<string, number>;
  answer_changes: Record<string, number>;
  outcome_type: string;
  /** The first two perspectives in the stored ranking, with their distances. Used only for pairs and the runner-up gap. */
  ranked: { id: string; distance: number }[];
  /** Construct ID -> band, null where the person wasn't placed. */
  bands: Record<string, BandId | null>;
  fit_rating: number | null;
  better_fit: string | null;
  quick_check_shown: string | null;
  prediction_kind: string | null;
  prediction_perspectives: string[] | null;
  outcome_reason: string | null;
}

const BAND_ORDER: BandId[] = ["strong_low", "lean_low", "between", "lean_high", "strong_high"];
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/** Two perspectives as one unordered pair key, "a+b" with a < b. */
export const pairKey = (a: string, b: string) => [a, b].sort().join("+");

/** The two perspectives an In between result sits between, or null for any other result. */
export function betweenPair(r: Pick<AdminRow, "outcome_type" | "ranked">): [string, string] | null {
  if (r.outcome_type !== "mixed_between" || r.ranked.length < 2) return null;
  return [r.ranked[0].id, r.ranked[1].id].sort() as [string, string];
}

// ---------- Section 2: response quality ----------

export function qualityByRow(content: Content, rows: AdminRow[]): Map<string, QualityFlag[]> {
  const statements = statementKeys(content);
  const releaseMedian = releaseMedianMs(rows.map((r) => totalMs(r.timings_ms)));
  return new Map(rows.map((r) => [r.id, quality(statements, r, releaseMedian).flags]));
}

// ---------- Section 3: how people spread across each theme ----------

export interface ThemeSpread {
  construct: string;
  name: string;
  low: string;
  high: string;
  /** People placed on this theme. */
  n: number;
  few: boolean;
  /** One per band, low end to high end. */
  bands: { band: BandId; label: string; n: number; pct: string; width: number }[];
  notPlaced: number;
  /** The whole row in words, for screen readers. */
  summary: string;
}

export function themeSpread(content: Content, rows: AdminRow[]): ThemeSpread[] {
  return content.config.scored_constructs.map((c) => {
    const nar = content.narratives.constructs[c];
    const counts = BAND_ORDER.map((band) => rows.filter((r) => r.bands?.[c] === band).length);
    const n = counts.reduce((s, x) => s + x, 0);
    const max = Math.max(0, ...counts);
    const label = (band: BandId) => content.narratives.bands[band].replace("{low}", nar.low).replace("{high}", nar.high);
    const bands = BAND_ORDER.map((band, i) => ({ band, label: label(band), n: counts[i], pct: pct(counts[i], n), width: max > 0 ? counts[i] / max : 0 }));
    return {
      construct: c,
      name: nar.question,
      low: nar.low,
      high: nar.high,
      n,
      few: n < FEW,
      bands,
      notPlaced: rows.length - n,
      summary: `${nar.question} ${countOf(n, "person", "people")} placed: ${bands.map((b) => `${b.label}, ${b.n}`).join("; ")}.`,
    };
  });
}

// ---------- Section 4: question health ----------

/** "Nearly everyone on one side": more than this share agree (5 to 7), or disagree (1 to 3). */
export const ONE_SIDE = 0.8;

export interface StatementHealth {
  item: string;
  construct: string;
  text: string;
  /** Answers at 1..7. */
  spread: number[];
  answered: number;
  skipRate: number;
  changedRate: number;
  /** The larger of the agree and disagree shares. */
  oneSide: number;
  oneSideFlag: boolean;
  few: boolean;
}

export interface BothAgree {
  a: string;
  b: string;
  /** The two statements' short text. */
  aText: string;
  bText: string;
  construct: string;
  /** People who answered both. */
  n: number;
  share: number;
}

const agree = (v: unknown) => typeof v === "number" && v >= 5;
const disagree = (v: unknown) => typeof v === "number" && v <= 3;

export function questionHealth(content: Content, rows: AdminRow[]): { statements: StatementHealth[]; pairs: BothAgree[] } {
  const form = content.items.forms[content.config.form];
  const blocks = form?.blocks ?? [];
  const statements = blocks.flatMap((b) =>
    b.items.map((id) => {
      const values = rows.map((r) => r.answers[id]).filter((v): v is number => typeof v === "number");
      const spread = [1, 2, 3, 4, 5, 6, 7].map((x) => values.filter((v) => v === x).length);
      const answered = values.length;
      const oneSide = answered > 0 ? Math.max(values.filter(agree).length, values.filter(disagree).length) / answered : 0;
      const item = content.itemsById.get(id);
      return {
        item: id,
        construct: b.construct,
        text: item?.short ?? item?.stem ?? id,
        spread,
        answered,
        skipRate: rows.length > 0 ? 1 - answered / rows.length : 0,
        changedRate: rows.length > 0 ? rows.filter((r) => (r.answer_changes?.[id] ?? 0) > 0).length / rows.length : 0,
        oneSide,
        // Flags are hidden below FEW answers.
        oneSideFlag: answered >= FEW && oneSide > ONE_SIDE,
        few: answered < FEW,
      };
    }),
  );

  // Statements on the same theme that point in opposite directions (one "+" pole, one "-").
  const pairs: BothAgree[] = [];
  for (const b of blocks) {
    const pole = (id: string) => content.itemsById.get(id)?.pole;
    const plus = b.items.filter((id) => pole(id) === "+");
    const minus = b.items.filter((id) => pole(id) === "-");
    for (const a of plus) {
      for (const m of minus) {
        const both = rows.filter((r) => typeof r.answers[a] === "number" && typeof r.answers[m] === "number");
        const n = both.length;
        const text = (id: string) => content.itemsById.get(id)?.short ?? content.itemsById.get(id)?.stem ?? id;
        pairs.push({ a, b: m, aText: text(a), bText: text(m), construct: b.construct, n, share: n > 0 ? both.filter((r) => agree(r.answers[a]) && agree(r.answers[m])).length / n : 0 });
      }
    }
  }
  pairs.sort((x, y) => y.share - x.share || y.n - x.n || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return { statements, pairs };
}

/** The pairs worth listing under "Agree with both": the top five, or none when even the top one is 0%. */
export function worstBothAgree(pairs: BothAgree[], n = 5): BothAgree[] {
  const answered = pairs.filter((p) => p.n > 0);
  return answered.length > 0 && answered[0].share > 0 ? answered.slice(0, n) : [];
}

/** The columns the question health table sorts by (`?qsort=`). */
export const HEALTH_SORTS = ["item", "answered", "skip", "changed", "side"] as const;
export type HealthSort = (typeof HEALTH_SORTS)[number];

/** The table opens on what needs a look: most on one side first (PR #65 review, item 5). */
export const DEFAULT_HEALTH_SORT: HealthSort = "side";
/** Rows shown before "Show all". */
export const HEALTH_FIRST_ROWS = 10;

export function parseHealthSort(raw: unknown): HealthSort {
  return HEALTH_SORTS.includes(raw as HealthSort) ? (raw as HealthSort) : DEFAULT_HEALTH_SORT;
}

/** Sorted for the table: the item column in form order, every other column largest first, ties by skip rate then form order. */
export function sortHealth(rows: StatementHealth[], by: HealthSort): StatementHealth[] {
  const key: Record<Exclude<HealthSort, "item">, (r: StatementHealth) => number> = {
    answered: (r) => r.answered,
    skip: (r) => r.skipRate,
    changed: (r) => r.changedRate,
    side: (r) => r.oneSide,
  };
  if (by === "item") return rows;
  const order = new Map(rows.map((r, i) => [r.item, i]));
  return [...rows].sort((a, b) => key[by](b) - key[by](a) || b.skipRate - a.skipRate || order.get(a.item)! - order.get(b.item)!);
}

// ---------- Sections 5 and 9: how well each perspective fits, and In between pairs ----------

/**
 * How close the runner-up was: the gap between the closest and second-closest
 * distance. Under `veryClose` (the scorer's tie margin, which already makes
 * "In between") is very close; under `close` is close; anything else is clear.
 */
export function runnerUpBands(content: Content): { veryClose: number; close: number } {
  const tie = content.config.match.tie_margin;
  return { veryClose: tie, close: tie * 2 };
}

export type Closeness = "clear" | "close" | "very_close";

export function closeness(content: Content, ranked: AdminRow["ranked"]): Closeness | null {
  if (ranked.length < 2) return null;
  const gap = ranked[1].distance - ranked[0].distance;
  const t = runnerUpBands(content);
  return gap < t.veryClose ? "very_close" : gap < t.close ? "close" : "clear";
}

const CLARITY_WORDS: Record<Closeness, string> = { clear: "mostly clear", close: "often close", very_close: "mostly very close" };

/** The most common of clear / close / very close, in words (a tie goes to the less clear), and the counts. */
export function clarityWords(close: Closeness[]): { words: string; counts: string } {
  const n = (c: Closeness) => close.filter((x) => x === c).length;
  const order: Closeness[] = ["very_close", "close", "clear"];
  const top = order.reduce((a, b) => (n(b) > n(a) ? b : a));
  return { words: CLARITY_WORDS[top], counts: `clear ${n("clear")} · close ${n("close")} · very close ${n("very_close")}` };
}

export interface FitRow {
  name: string;
  /** A sub-row of In between, for one pair. */
  sub: boolean;
  n: number;
  /** People with this result, rated or not. */
  people: number;
  few: boolean;
  /** Ratings 1..5. */
  spread: number[];
  well: string;
  poor: string;
  poorFlag: boolean;
  /** Every "Which fits you better?" answer, most first: "Stewards (3), None of these (1)". */
  picked: string;
  /**
   * How clear the result was, in words ("mostly clear", "often close", "mostly
   * very close") with the counts, or null for In between and its pairs (very
   * close by definition), Your own combination (nothing was close) and where
   * there is no runner-up.
   */
  clarity: { words: string; counts: string } | null;
  /** The row in words, for screen readers. */
  summary: string;
}

/** A share above this is flagged. Same as the other cards (lib/admin FLAG). */
const POOR_FLAG = 0.3;

export function fitRows(content: Content, copy: CopyFile, rows: AdminRow[]): FitRow[] {
  const names = new Map(content.perspectives.perspectives.map((p) => [p.id, p.name]));
  const name = (id: string) => names.get(id) ?? id;
  const pickName = (pick: string) => (pick === "none" ? copy.fit.better_none : pick === "own_mix" ? copy.fit.better_own_mix : name(pick));

  const row = (label: string, group: AdminRow[], sub = false): FitRow => {
    const rated = group.filter((r) => r.fit_rating !== null);
    const n = rated.length;
    const spread = [1, 2, 3, 4, 5].map((x) => rated.filter((r) => r.fit_rating === x).length);
    const poor = spread[0] + spread[1];
    const picks = new Map<string, number>();
    for (const r of group) if (r.better_fit) picks.set(r.better_fit, (picks.get(r.better_fit) ?? 0) + 1);
    const picked = [...picks.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p, k]) => `${pickName(p)} (${k})`);
    const close = group.map((r) => closeness(content, r.ranked)).filter((x): x is Closeness => x !== null);
    // In between is very close by definition, and Your own combination means no
    // perspective was close, so the runner-up gap says nothing for either.
    const noGap = group.length > 0 && group.every((r) => r.outcome_type === "mixed_between" || r.outcome_type === "mixed_unmatched");
    const clarity = close.length && !noGap ? clarityWords(close) : null;
    return {
      name: label,
      sub,
      n,
      people: group.length,
      few: n < FEW,
      spread,
      well: pct(spread[3] + spread[4], n),
      poor: pct(poor, n),
      poorFlag: n >= FEW && poor / n > POOR_FLAG,
      picked: picked.length ? picked.join(", ") : "–",
      clarity,
      summary: `${label}: ${countOf(n, "rating", "ratings")}, ${spread.map((k, i) => `${copy.fit.options[i] ?? i + 1} ${k}`).join(", ")}.`,
    };
  };

  const out: FitRow[] = [];
  for (const p of content.perspectives.perspectives) out.push(row(p.name, rows.filter((r) => r.outcome_type === "matched" && r.ranked[0]?.id === p.id)));
  const between = rows.filter((r) => r.outcome_type === "mixed_between");
  out.push(row("In between", between));
  for (const pair of betweenPairs(content, rows)) {
    out.push(row(pair.label, between.filter((r) => pairKey(...betweenPair(r)!) === pair.key), true));
  }
  out.push(row("Your own combination", rows.filter((r) => r.outcome_type === "mixed_unmatched")));
  out.push(row("Still forming and Not a priority", rows.filter((r) => r.outcome_type === "undecided" || r.outcome_type === "indifferent")));
  return out.filter((r) => r.people > 0);
}

export interface BetweenPair {
  key: string;
  ids: [string, string];
  label: string;
  n: number;
  /** Share of all In between results. */
  pct: string;
  few: boolean;
}

/** Every In between pair with at least one response, most first. A and B counts the same as B and A. */
export function betweenPairs(content: Content, rows: Pick<AdminRow, "outcome_type" | "ranked">[]): BetweenPair[] {
  const names = new Map(content.perspectives.perspectives.map((p) => [p.id, p.name]));
  const counts = new Map<string, number>();
  for (const r of rows) {
    const pair = betweenPair(r);
    if (pair) counts.set(pairKey(...pair), (counts.get(pairKey(...pair)) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  return [...counts.entries()]
    .map(([key, n]) => {
      const ids = key.split("+") as [string, string];
      return { key, ids, label: `${names.get(ids[0]) ?? ids[0]} and ${names.get(ids[1]) ?? ids[1]}`, n, pct: pct(n, total), few: n < FEW };
    })
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/** For each perspective, the others it was In between with: "Pragmatists (3), Precautionists (1)", or "". */
export function alsoBetweenWith(content: Content, rows: Pick<AdminRow, "outcome_type" | "ranked">[]): Map<string, string> {
  const pairs = betweenPairs(content, rows);
  const names = new Map(content.perspectives.perspectives.map((p) => [p.id, p.name]));
  const out = new Map<string, string>();
  for (const p of content.perspectives.perspectives) {
    const others = pairs
      .filter((x) => x.ids.includes(p.id))
      .map((x) => ({ id: x.ids[0] === p.id ? x.ids[1] : x.ids[0], n: x.n }))
      .sort((a, b) => b.n - a.n);
    out.set(p.id, others.map((o) => `${names.get(o.id) ?? o.id} (${o.n})`).join(", "));
  }
  return out;
}

// ---------- Section 8: research setup check ----------

export interface SetupLine {
  label: string;
  value: string;
  /** null while there are too few responses to judge. */
  ok: boolean | null;
  note: string;
}

export function setupCheck(content: Content, copy: CopyFile, rows: AdminRow[]): SetupLine[] {
  const n = rows.length;
  const enough = n >= FEW;
  const share = (k: number) => (n > 0 ? k / n : 0);
  const within = (x: number, lo: number, hi: number) => (enough ? x >= lo && x <= hi : null);

  const agreeFirstN = rows.filter((r) => r.answer_direction === "agree_first").length;
  const shownN = rows.filter((r) => r.quick_check_shown !== null).length;
  const both = rows.filter((r) => r.quick_check_shown !== null && r.prediction_kind !== null).length;

  // The order isn't stored: rebuild it from each response's seed (lib/form).
  const form = content.items.forms[content.config.form];
  const s1First = rows.filter((r) => {
    const f = content.items.forms[r.form] ?? form;
    const after = buildSequence(f, r.form, r.seed).steps.find((s) => s.part === "after_sections");
    return after?.itemId === "S1";
  }).length;

  const show = copy.quick_check.show_share;
  return [
    { label: "Answer direction: agree first", value: pct(agreeFirstN, n), ok: within(share(agreeFirstN), 0.4, 0.6), note: "OK between 40% and 60%" },
    { label: "Quick check shown", value: pct(shownN, n), ok: within(share(shownN), 0.15, 0.35), note: `OK between 15% and 35% (set to ${Math.round(show * 100)}%)` },
    { label: "Guess and quick check on the same response", value: String(both), ok: both === 0, note: "Must be 0" },
    { label: "S1 shown first after the six sections", value: pct(s1First, n), ok: n > 0 ? s1First === n : null, note: "OK at 100%, rebuilt from each seed" },
  ];
}

// ---------- Section 6: location ----------

export interface LocationRow {
  label: string;
  allTime: number;
  allPct: string;
  week: number;
  weekPct: string;
}

/**
 * Each answer to "Where do you live?" (D11), then "Not answered". Only what people told us.
 * An answer counts under the label it had in its own item bank version (`optionsByItemBank`;
 * the current options if its version isn't there). Today's options come first, then any older
 * label that's no longer an option (e.g. "Australia" before item bank 0.9.0), if anyone chose it.
 */
export function location(
  content: Content,
  raw: { item_bank_version: string; option: number | null; all_time: number; last_7_days: number }[],
  optionsByItemBank: ReadonlyMap<string, readonly string[]> = new Map(),
): LocationRow[] {
  const options = content.itemsById.get("D11")?.options ?? [];
  const labelOf = (r: (typeof raw)[number]) => (r.option === null ? undefined : (optionsByItemBank.get(r.item_bank_version) ?? options)[r.option]);
  const all = raw.reduce((s, r) => s + r.all_time, 0);
  const week = raw.reduce((s, r) => s + r.last_7_days, 0);
  const row = (label: string, rows: typeof raw): LocationRow => {
    const a = rows.reduce((s, r) => s + r.all_time, 0);
    const w = rows.reduce((s, r) => s + r.last_7_days, 0);
    return { label, allTime: a, allPct: pct(a, all), week: w, weekPct: pct(w, week) };
  };
  const older = [...new Set(raw.map(labelOf).filter((l): l is string => l !== undefined && !options.includes(l)))];
  return [
    ...[...options, ...older].map((label) => row(label, raw.filter((r) => labelOf(r) === label))),
    row("Not answered", raw.filter((r) => labelOf(r) === undefined)),
  ];
}

// ---------- Section 7: sharing ----------

export interface Sharing {
  compared: number;
  comparedPct: string;
  targets: number;
  top: { id: string; n: number }[];
}

export function sharing(raw: { total: number; compared: number; targets: number; top: { id: string; n: number }[] }): Sharing {
  return { compared: raw.compared, comparedPct: pct(raw.compared, raw.total), targets: raw.targets, top: raw.top.map((t) => ({ id: t.id, n: t.n })) };
}

// ---------- The flagged tile ----------

export function flaggedTile(flags: Map<string, QualityFlag[]>): { n: number; pct: string } {
  const n = [...flags.values()].filter((f) => f.length > 0).length;
  return { n, pct: pct(n, flags.size) };
}

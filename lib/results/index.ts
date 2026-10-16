// Turns a scored result into the words and positions a results page shows
// (docs/01-product-spec.md section 5.6). All wording comes from content/; this
// module only picks templates and fills them. No numbers about the person
// appear in any string: positions are for drawing a marker, never for display.
import { type BandId, type BaseRate, type Content, type Item, type Perspective } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";
import type {
  Answers,
  CompareResult,
  ConstructScore,
  Direction,
  OutcomeType,
  RankedPerspective,
  ScoreResult,
  StatementRef,
  UndecidedReason,
} from "@/lib/scoring";
import { band, signal } from "@/lib/scoring";

/** Replace {name} in a template. Every name in the template must be given. */
export function render(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z0-9_]+)\}/g, (whole, name: string) => {
    if (!(name in values)) throw new Error(`template needs {${name}}: ${template}`);
    return String(values[name]);
  });
}

export interface PerspectiveView {
  id: string;
  name: string;
  tagline: string;
  /** The one-line summary on the share image; null for releases before taxonomy 0.2.1. */
  cardSummary: string | null;
  description: string;
  strongestObjection: string;
  discussionPrompt: string;
  /** "Elsewhere you might hear": outside names for this view; null for releases before taxonomy 0.3.0. */
  elsewhere: string | null;
}

export interface TrackView {
  construct: string;
  /** The question's short name ("Expected benefit"), for the share image. */
  name: string;
  question: string;
  lowLabel: string;
  highLabel: string;
  /** 0 at the low end, 1 at the high end; null when not measured. For placing a marker only. */
  position: number | null;
  band: BandId | null;
  /** The band in words, or the "not enough answers" line. */
  bandText: string;
  answered: number;
  expected: number;
  /** Text equivalent of the track for screen readers. */
  description: string;
}

export interface BaseRateView {
  construct: string;
  text: string;
  source: string;
  year: number;
  country: string;
  /** Display name of the country, from content/copy.json. */
  countryName: string;
  population: string;
  approximate: boolean;
  similarQuestion: boolean;
  ledger: string;
  /** True when no figure exists for the person's own country and this one is from elsewhere. */
  fromOtherCountry: boolean;
}

/** What each outcome adds in place of the matched headline section (docs/01-product-spec.md 5.6). */
export type OutcomeDetail =
  | { type: "matched" }
  | {
      type: "mixed_between";
      /** One card per perspective, with one view the person shares with it (if any). */
      cards: { perspective: PerspectiveView; shared: string | null }[];
      /** The question on which the two perspectives' typical positions differ most. */
      tip: { construct: string; question: string };
    }
  | {
      type: "mixed_unmatched";
      heading: string;
      distinctive: string | null;
      /** "Your answers line up with Accelerators on … and Stewards on …", or null if fewer than two match. */
      overlap: string | null;
      nearestLabel: string;
      nearest: PerspectiveView[];
    }
  | {
      type: "undecided";
      leanHeading: string;
      /** Constructs where the person leans one way; empty means `leanNone` applies. */
      leanings: { construct: string; question: string; bandText: string }[];
      leanNone: string;
      promptsHeading: string;
      /** Discussion prompts of the three nearest perspectives, nearest first. */
      prompts: string[];
    }
  | { type: "indifferent"; heading: string; body: string };

export interface ResultView {
  versions: ScoreResult["versions"];
  detail: OutcomeDetail;
  /** Source lines for any figure quoted in the outcome body copy. */
  subheadSources: string[];
  outcome: OutcomeType;
  undecidedReason: UndecidedReason | null;
  /** The same for everyone: a visitor reads the result as written for its owner (issue #37). */
  headline: string;
  /** Matched: "Closest of the seven…, also near…". Other outcomes: their body copy. */
  subhead: string | null;
  /** The perspective the page is about: the closest one (matched), else null. */
  perspective: PerspectiveView | null;
  /** Mixed, between: the two perspectives. */
  between: [PerspectiveView, PerspectiveView] | null;
  /** The next two after the closest, as "also near" chips. */
  alsoNear: PerspectiveView[];
  /** Full ranking, closest first, without distances. */
  ranking: PerspectiveView[];
  tension: { id: string; text: string } | null;
  tracks: TrackView[];
  statements: { commonGround: string[]; difference: string | null; unexpected: string | null };
  baseRates: BaseRateView[];
  whyThisResult: string;
  /** The "early version" note shown under the headline card on every outcome (markdown link to /changes). */
  provisional: string;
  /**
   * For someone unsure who answered strongly (outcome `unsettled`, docs/02
   * section 3): a note that their views are still forming. Null otherwise.
   */
  unsettledNote: string | null;
}

function perspectiveView(p: Perspective): PerspectiveView {
  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    // Frozen releases are not re-parsed with today's schema (lib/content/release.ts).
    cardSummary: (p as Partial<Perspective>).card_summary ?? null,
    description: p.description,
    strongestObjection: p.strongest_objection,
    discussionPrompt: p.discussion_prompt,
    elsewhere: p.elsewhere ?? null,
  };
}

function lookup(c: Content) {
  const persp = new Map(c.perspectives.perspectives.map((p) => [p.id, p]));
  return {
    perspective(id: string): Perspective {
      const p = persp.get(id);
      if (!p) throw new Error(`unknown perspective ${id}`);
      return p;
    },
    item(id: string): Item {
      const i = c.itemsById.get(id);
      if (!i) throw new Error(`unknown item ${id}`);
      return i;
    },
  };
}

export function trackView(c: Content, construct: string, s: ConstructScore): TrackView {
  const n = c.narratives;
  const meta = n.constructs[construct];
  const { min, max, center } = c.config.likert;
  const half = Math.max(max - center, center - min);
  const bandText =
    s.band === null ? render(n.unmeasured, { answered: s.answered, expected: s.expected }) : render(n.bands[s.band], meta);
  return {
    construct,
    name: meta.name,
    question: meta.question,
    lowLabel: meta.low,
    highLabel: meta.high,
    position: s.score === null ? null : Math.min(1, Math.max(0, (s.score + half) / (2 * half))),
    band: s.band,
    bandText,
    answered: s.answered,
    expected: s.expected,
    description: `${meta.question} ${bandText}`,
  };
}

function statementText(c: Content, template: string, ref: StatementRef, perspectiveName: string): string {
  const short = lookup(c).item(ref.item).short;
  if (!short) throw new Error(`item ${ref.item} has no short text`);
  return render(template, { perspective: perspectiveName, short });
}

function pickTemplate(templates: Record<string, string>, base: string, direction: Direction): string {
  const t = templates[`${base}_${direction}`];
  if (!t) throw new Error(`missing template ${base}_${direction}`);
  return t;
}

/** The person's country code from D11, if it maps to one in content/copy.json. */
export function countryOf(c: Content, copy: CopyFile, answers: Answers): string | null {
  const v = answers.D11;
  if (typeof v !== "number") return null;
  const label = lookup(c).item("D11").options[v];
  return copy.countries.find((x) => x.d11_option === label)?.code ?? null;
}

/**
 * Up to `limit` base-rate cards, one per construct, for the constructs where the
 * person leans most clearly (largest distance from the middle; ties by construct
 * ID). Each card prefers the person's own country; if there is none, the first
 * figure for that construct from another country, marked as such.
 */
export function pickBaseRates(
  c: Content,
  copy: CopyFile,
  result: ScoreResult,
  country: string | null,
  limit = 3,
): BaseRateView[] {
  const order = Object.entries(result.constructs)
    .filter(([, s]) => s.score !== null)
    .sort(([ka, a], [kb, b]) => Math.abs(b.score!) - Math.abs(a.score!) || (ka < kb ? -1 : 1))
    .map(([k]) => k);
  const names = new Map(copy.countries.map((x) => [x.code, x.name]));
  const out: BaseRateView[] = [];
  for (const k of order) {
    if (out.length >= limit) break;
    const forConstruct = c.baseRates.items.filter((r) => r.construct === k);
    const own = country ? forConstruct.find((r) => r.country === country) : undefined;
    const pick: BaseRate | undefined = own ?? forConstruct[0];
    if (!pick) continue;
    out.push({
      construct: k,
      text: pick.text,
      source: pick.source,
      year: pick.year,
      country: pick.country,
      countryName: names.get(pick.country) ?? pick.country,
      population: pick.population,
      approximate: pick.approximate,
      similarQuestion: pick.similar_question ?? false,
      ledger: pick.ledger,
      fromOtherCountry: !own,
    });
  }
  return out;
}

export function headlineFor(
  c: Content,
  type: OutcomeType,
  ranked: RankedPerspective[],
  reason: UndecidedReason | null,
): { headline: string; subhead: string | null } {
  const o = c.narratives.outcomes;
  const name = (i: number) => ranked[i]?.name;
  switch (type) {
    case "matched": {
      const p1 = name(0)!;
      // The subhead names two more perspectives; skip it when fewer could be placed.
      const subhead = o.matched.subhead && name(1) && name(2) ? render(o.matched.subhead, { p2: name(1)!, p3: name(2)! }) : null;
      return { headline: render(o.matched.headline, { p1 }), subhead };
    }
    case "mixed_between":
      return { headline: render(o.mixed_between.headline, { p1: name(0)!, p2: name(1)! }), subhead: o.mixed_between.body ?? null };
    case "mixed_unmatched":
      return { headline: o.mixed_unmatched.headline, subhead: o.mixed_unmatched.body ?? null };
    case "indifferent":
      return { headline: o.indifferent.headline, subhead: o.indifferent.body ?? null };
    case "undecided": {
      const u = o.undecided;
      // The middle reason only exists from scoring 0.3.0, whose release has its wording.
      if (reason === "middle") return { headline: u.middle_headline, subhead: u.middle_body };
      return { headline: u.headline, subhead: (reason === "coverage" ? u.coverage_body : u.body) ?? null };
    }
  }
}

/**
 * "In between": for each perspective, the first of its signature statements the
 * person shares (same rule as common ground); and the question on which the two
 * perspectives' typical positions are furthest apart (ties by construct ID).
 */
function betweenDetail(c: Content, ranking: PerspectiveView[], answers: Answers): OutcomeDetail {
  const look = lookup(c);
  const t = c.narratives.statements as Record<string, string>;
  const [a, b] = [look.perspective(ranking[0].id), look.perspective(ranking[1].id)];
  const cards = [a, b].map((p) => {
    const sig = p.signatures.find((x) => signal(c, x.item, answers) === x.direction);
    const shared = sig
      ? statementText(c, pickTemplate(t, "common_ground_with_closest", sig.direction), { perspective: p.id, item: sig.item, direction: sig.direction }, p.name)
      : null;
    return { perspective: perspectiveView(p), shared };
  });
  let tip = c.config.scored_constructs[0];
  for (const k of c.config.scored_constructs) {
    if (Math.abs(a.prototype[k] - b.prototype[k]) > Math.abs(a.prototype[tip] - b.prototype[tip])) tip = k;
  }
  return { type: "mixed_between", cards, tip: { construct: tip, question: c.narratives.constructs[tip].question } };
}

function outcomeDetail(c: Content, view: Omit<ResultView, "detail" | "subheadSources">, answers: Answers): OutcomeDetail {
  const o = c.narratives.outcomes;
  switch (view.outcome) {
    case "matched":
      return { type: "matched" };
    case "mixed_between":
      return betweenDetail(c, view.ranking, answers);
    case "mixed_unmatched":
      return {
        type: "mixed_unmatched",
        heading: o.mixed_unmatched.distinctive_heading,
        distinctive: view.tension?.text ?? null,
        overlap: overlapLine(c, view.tracks),
        nearestLabel: o.mixed_unmatched.nearest_label,
        nearest: view.ranking.slice(0, 2),
      };
    case "undecided":
      return {
        type: "undecided",
        leanHeading: o.undecided.lean_heading,
        leanings: view.tracks
          .filter((t) => t.band !== null && t.band !== "between")
          .map((t) => ({ construct: t.construct, question: t.question, bandText: t.bandText })),
        leanNone: o.undecided.lean_none,
        promptsHeading: o.undecided.prompts_heading,
        prompts: view.ranking.slice(0, 3).map((p) => p.discussionPrompt),
      };
    case "indifferent":
      return { type: "indifferent", heading: o.indifferent.section_heading, body: o.indifferent.section_body };
  }
}

/** Source lines for the evidence the outcome body cites. The coverage and middle bodies cite nothing. */
function subheadSources(c: Content, copy: CopyFile, type: OutcomeType, reason: UndecidedReason | null): string[] {
  if (type === "matched" || reason === "coverage" || reason === "middle") return [];
  const refs = (c.narratives.outcomes[type] as { evidence_refs?: string[] }).evidence_refs ?? [];
  return refs.map((ref) => {
    const src = copy.evidence_sources.sources[ref];
    if (!src) throw new Error(`no source line for evidence ${ref}`);
    return render(copy.results.source_line, { source: src.source, year: src.year, population: src.population });
  });
}

export function resultView(c: Content, copy: CopyFile, result: ScoreResult, answers: Answers): ResultView {
  const base = baseView(c, copy, result, answers);
  return {
    ...base,
    detail: outcomeDetail(c, base, answers),
    subheadSources: subheadSources(c, copy, base.outcome, base.undecidedReason),
  };
}

function baseView(c: Content, copy: CopyFile, result: ScoreResult, answers: Answers): Omit<ResultView, "detail" | "subheadSources"> {
  const look = lookup(c);
  const oc = result.outcome;
  const reason = oc.type === "undecided" ? oc.reason : null;
  const ranking = oc.ranked.map((r) => perspectiveView(look.perspective(r.id)));
  const { headline, subhead } = headlineFor(c, oc.type, oc.ranked, reason);

  const t = c.narratives.statements as Record<string, string>;
  const s = result.statements;
  const closestName = ranking[0]?.name ?? "";
  const nameOf = (id: string) => look.perspective(id).name;

  const answeredStatements = Object.values(result.constructs).reduce((n, x) => n + x.answered, 0);

  return {
    versions: result.versions,
    outcome: oc.type,
    undecidedReason: reason,
    headline,
    subhead,
    perspective: oc.type === "matched" ? ranking[0] : null,
    between: oc.type === "mixed_between" ? [ranking[0], ranking[1]] : null,
    alsoNear: oc.type === "matched" ? ranking.slice(1, 3) : [],
    ranking,
    tension: result.tension ? { id: result.tension.id, text: result.tension.text } : null,
    tracks: Object.entries(result.constructs).map(([k, v]) => trackView(c, k, v)),
    statements: {
      commonGround: s.common_ground.map((r) =>
        statementText(c, pickTemplate(t, "common_ground_with_closest", r.direction), r, closestName),
      ),
      difference: s.differences[0]
        ? statementText(c, pickTemplate(t, "difference_with_closest", s.differences[0].direction), s.differences[0], closestName)
        : null,
      unexpected: s.unexpected
        ? statementText(c, pickTemplate(t, "unexpected_common_ground", s.unexpected.direction), s.unexpected, nameOf(s.unexpected.perspective))
        : null,
    },
    baseRates: pickBaseRates(c, copy, result, countryOf(c, copy, answers)),
    whyThisResult: render(c.narratives.why_this_result, { n_items: answeredStatements }),
    provisional: c.narratives.provisional,
    // Results and releases from before scoring 0.2.0 / narratives 0.4.0 have neither.
    unsettledNote:
      "unsettled" in oc && oc.unsettled === true ? ((c.narratives as { unsettled_note?: string }).unsettled_note ?? null) : null,
  };
}

export interface CompareView {
  tracks: { construct: string; question: string; lowLabel: string; highLabel: string; a: TrackView; b: TrackView }[];
  biggestGap: { construct: string; question: string } | null;
  /** No biggest gap because every question they can be compared on is the same, not because too few could be. */
  noDifference: boolean;
  agree: string[];
  disagree: string[];
}

/** Words for the friend comparison. Gap sizes are never shown, only which question differs most. */
export function compareView(c: Content, cmp: CompareResult, a: ScoreResult, b: ScoreResult): CompareView {
  const t = c.narratives.statements as Record<string, string>;
  const short = (id: string) => {
    const s = lookup(c).item(id).short;
    if (!s) throw new Error(`item ${id} has no short text`);
    return s;
  };
  return {
    tracks: Object.keys(a.constructs).map((k) => {
      const meta = c.narratives.constructs[k];
      return {
        construct: k,
        question: meta.question,
        lowLabel: meta.low,
        highLabel: meta.high,
        a: trackView(c, k, a.constructs[k]),
        b: trackView(c, k, b.constructs[k]),
      };
    }),
    biggestGap: cmp.biggest_gap ? { construct: cmp.biggest_gap, question: c.narratives.constructs[cmp.biggest_gap].question } : null,
    noDifference: cmp.biggest_gap === null && Object.values(cmp.gaps).some((g) => g !== null),
    agree: cmp.agree.map((r) => render(pickTemplate(t, "friend_agree", r.a), { short: short(r.item) })),
    disagree: cmp.disagree.map((r) => render(t.friend_disagree_prompt, { short: short(r.item) })),
  };
}

/**
 * The link people share (issue #37): the result's page with ?view=shared,
 * which always shows the read-only visitor view, even in the browser that
 * saved the result, so the sharer sees exactly what their friends will.
 */
export const SHARED_VIEW = "shared";
export function sharedResultPath(id: string): string {
  return `/r/${id}?view=${SHARED_VIEW}`;
}

/**
 * Whether `?view=` marks the shared link. Some share menus copy the share text
 * along with the link, and pasting both into the address bar leaves the text
 * on the end ("shared I landed between…"), so anything starting with
 * "shared" counts.
 */
export function isSharedView(view: string | string[] | undefined): boolean {
  const v = Array.isArray(view) ? view[0] : view;
  return typeof v === "string" && v.trim().toLowerCase().startsWith(SHARED_VIEW);
}

/** The share line for a result (docs/01-product-spec.md 5.7), without the link. */
export function shareText(copy: CopyFile, view: ResultView): string {
  const t = copy.share.text;
  const site = copy.site.name;
  switch (view.outcome) {
    case "matched":
      return render(t.matched, { perspective: view.ranking[0].name, site });
    case "mixed_between":
      return render(t.mixed_between, { p1: view.ranking[0].name, p2: view.ranking[1].name, site });
    case "undecided":
      // Releases before copy 0.7.0 have no middle line, but never a middle result either.
      return render(view.undecidedReason === "middle" && t.undecided_middle ? t.undecided_middle : t.undecided, { site });
    default:
      return render(t[view.outcome], { site });
  }
}

/**
 * For "Your own combination": the perspectives the person lines up with on
 * particular questions (issue #11). A question counts when the person's band is
 * within one band of the perspective's typical position there. Pairs are taken
 * in order of how much the question defines the perspective (weight, at least
 * 1), closest band first, each perspective and each question at most once, up
 * to three. Fewer than two pairs: no line.
 */
export function overlapLine(c: Content, tracks: TrackView[]): string | null {
  const bands = c.config.bands;
  const order = bands.map((b) => b.id);
  const o = c.narratives.outcomes.mixed_unmatched;
  // Releases before narratives 0.3.1 have no overlap templates or topics.
  if (!o.overlap || !o.overlap_pair) return null;
  const candidates: { perspective: string; construct: string; weight: number; gap: number }[] = [];
  for (const p of c.perspectives.perspectives) {
    for (const t of tracks) {
      const w = p.weight[t.construct] ?? 0;
      if (t.band === null || w < 1 || !c.narratives.constructs[t.construct]?.topic) continue;
      const gap = Math.abs(order.indexOf(t.band) - order.indexOf(band(p.prototype[t.construct], bands)));
      if (gap <= 1) candidates.push({ perspective: p.id, construct: t.construct, weight: w, gap });
    }
  }
  candidates.sort((a, b) => b.weight - a.weight || a.gap - b.gap);
  const picked: typeof candidates = [];
  for (const x of candidates) {
    if (picked.length === 3) break;
    if (picked.some((y) => y.perspective === x.perspective || y.construct === x.construct)) continue;
    picked.push(x);
  }
  if (picked.length < 2) return null;
  const look = lookup(c);
  const pairs = picked.map((x) =>
    render(o.overlap_pair, { perspective: look.perspective(x.perspective).name, topic: c.narratives.constructs[x.construct].topic }),
  );
  const joined = pairs.length === 2 ? pairs.join(` ${o.overlap_and} `) : `${pairs.slice(0, -1).join(", ")} ${o.overlap_and} ${pairs.at(-1)}`;
  return render(o.overlap, { pairs: joined });
}

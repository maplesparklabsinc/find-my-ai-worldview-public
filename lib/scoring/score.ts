// The scoring rules from docs/02-scoring-spec.md, ported from reference/score.py.
// Pure and deterministic: the same content and answers always give the same
// result. Keep the order of every loop and sum as in the reference so floating
// point results match it exactly.
import { contentVersions, type BandId, type Content, type Item, type ScoringConfig } from "@/lib/content";
import { pyRound } from "./round";
import type {
  Answers,
  AnswerValue,
  ConstructScores,
  Direction,
  Outcome,
  RankedPerspective,
  ScoreResult,
  Statements,
  TensionResult,
} from "./types";

export function isInt(v: AnswerValue | undefined): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

function isRecord(v: AnswerValue | undefined): v is Record<string, unknown> & AnswerValue {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function band(score: number, bands: ScoringConfig["bands"]): BandId {
  for (const b of bands) {
    if (b.max_exclusive === null || score < b.max_exclusive) return b.id;
  }
  // The schema guarantees an open-ended last band.
  throw new Error("no band matched");
}

function keyed(item: Item, raw: number, center: number): number {
  const x = raw - center;
  return item.pole === "-" ? -x : x;
}

function item(c: Content, id: string): Item {
  const it = c.itemsById.get(id);
  if (!it) throw new Error(`unknown item ${id}`);
  return it;
}

export function constructScores(c: Content, answers: Answers): ConstructScores {
  const cfg = c.config;
  const out: ConstructScores = {};
  const form = c.items.forms[cfg.form];
  for (const block of form.blocks) {
    const vals: number[] = [];
    for (const id of block.items) {
      const v = answers[id];
      if (isInt(v)) vals.push(keyed(item(c, id), v, cfg.likert.center));
    }
    const expected = block.items.length;
    if (vals.length >= cfg.min_items_per_construct) {
      const s = pyRound(sum(vals) / vals.length, 4);
      out[block.construct] = { score: s, band: band(s, cfg.bands), answered: vals.length, expected };
    } else {
      out[block.construct] = { score: null, band: null, answered: vals.length, expected };
    }
  }
  return out;
}

function sum(xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

function byDistanceThenId(a: RankedPerspective, b: RankedPerspective): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function distances(c: Content, scores: ConstructScores): RankedPerspective[] {
  const m = c.config.match;
  const res: RankedPerspective[] = [];
  for (const p of c.perspectives.perspectives) {
    const wAll = sum(Object.values(p.weight));
    let num = 0;
    let den = 0;
    for (const [k, w] of Object.entries(p.weight)) {
      const s = scores[k]?.score ?? null;
      if (w <= 0 || s === null) continue;
      const d = s - p.prototype[k];
      num += w * (d * d);
      den += w;
    }
    if (den < m.min_weight_share_evaluable * wAll) continue;
    res.push({ id: p.id, name: p.name, distance: pyRound(Math.sqrt(num / den), 4) });
  }
  return res.sort(byDistanceThenId);
}

function measured(scores: ConstructScores): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) if (v.score !== null) out[k] = v.score;
  return out;
}

export function outcome(c: Content, scores: ConstructScores, answers: Answers): Outcome {
  const cfg = c.config;
  const scored = measured(scores);
  const n = Object.keys(scored).length;
  const ranked = n > 0 ? distances(c, scores) : [];
  if (n < cfg.min_scored_constructs) return { type: "undecided", reason: "coverage", ranked };

  const ind = cfg.indifferent;
  const sal = answers[ind.salience_item];
  // Strictly below, so expected benefit and harm in the "between" band count (scoring 0.4.0).
  if (
    scored.C1 !== undefined &&
    scored.C2 !== undefined &&
    scored.C1 < ind.below_C1 &&
    scored.C2 < ind.below_C2 &&
    isInt(sal) &&
    ind.low_salience_options.includes(sal)
  ) {
    return { type: "indifferent", ranked };
  }

  const und = cfg.undecided;
  const probes = cfg.scored_constructs.map((k) => answers[`${und.confidence_item}:${k}`]).filter(isInt);
  const unsettled = probes.filter((p) => und.unsettled_options.includes(p)).length;
  const meanAbs = sum(Object.values(scored).map(Math.abs)) / n;
  const isUnsettled = probes.length > 0 && unsettled / probes.length >= und.min_unsettled_share;
  // People who haven't thought about most themes often agree a little with everything,
  // so a higher bar applies before they get a perspective (scoring 0.4.0).
  const unconsidered = probes.filter((p) => p === und.unconsidered_option).length;
  const threshold = unconsidered >= und.min_unconsidered_probes ? und.max_mean_abs_score_unconsidered : und.max_mean_abs_score;
  if (isUnsettled && meanAbs < threshold) {
    return { type: "undecided", reason: "confidence", ranked };
  }

  // Every scored question sits in the "between" band (|score| < 0.5), whether or
  // not the person said they were unsure: no perspective fits better than another.
  if (Object.values(scored).every((v) => Math.abs(v) < und.middle_max_abs_score)) {
    return { type: "undecided", reason: "middle", ranked };
  }

  // Unsettled but answering strongly: still gets a result, flagged so the page
  // adds a note that their views are still forming (docs/02 section 3).
  if (ranked.length === 0 || ranked[0].distance > cfg.match.max_distance_for_match) {
    return { type: "mixed_unmatched", ranked, unsettled: isUnsettled };
  }
  // The gap is rounded first (as Python's round), so a gap of exactly 0.2 is a match despite floating-point noise.
  if (ranked.length > 1 && pyRound(ranked[1].distance - ranked[0].distance, 4) < cfg.match.tie_margin) {
    return { type: "mixed_between", ranked, unsettled: isUnsettled };
  }
  return { type: "matched", ranked, unsettled: isUnsettled };
}

export function tension(c: Content, scores: ConstructScores, answers: Answers): TensionResult | null {
  const cfg = c.config;
  let best: TensionResult | null = null;
  for (const t of c.narratives.tensions) {
    const strengths: number[] = [];
    let holds = true;
    for (const cond of t.when) {
      if ("construct" in cond) {
        const s = scores[cond.construct]?.score ?? null;
        if (s === null || !(cond.op === ">=" ? s >= cond.value : s <= cond.value)) {
          holds = false;
          break;
        }
        strengths.push(Math.abs(s));
      } else if ("trust_low" in cond) {
        const grid = answers.D4;
        const v = isRecord(grid) ? (grid[cond.trust_low] as AnswerValue | undefined) : undefined;
        const st = isInt(v) ? (cfg.trust_strength[String(v)] ?? 0) : 0;
        if (st <= 0) {
          holds = false;
          break;
        }
        strengths.push(st);
      } else {
        const a = answers[cond.tradeoff];
        if (!isRecord(a) || a.choice !== cond.option) {
          holds = false;
          break;
        }
        strengths.push(a.strength === "strongly" ? 3.0 : 1.5);
      }
    }
    if (!holds) continue;
    const st = Math.min(...strengths);
    // As in the reference, compare against the stored (rounded) strength.
    if (st >= cfg.tension.min_strength && (best === null || st > best.strength)) {
      best = { id: t.id, text: t.text, strength: pyRound(st, 4) };
    }
  }
  if (best) return best;

  const scored = measured(scores);
  const keys = Object.keys(scored);
  if (keys.length === 0) return null;
  // Largest absolute score; ties go to the later construct ID, as Python's max on (abs, id).
  let k = keys[0];
  for (const x of keys.slice(1)) {
    const ax = Math.abs(scored[x]);
    const ak = Math.abs(scored[k]);
    if (ax > ak || (ax === ak && x > k)) k = x;
  }
  const name = c.narratives.constructs[k].name;
  return {
    id: "none",
    text: c.narratives.no_tension.replaceAll("{strongest_construct_name}", name),
    strength: 0,
    strongest_construct: k,
  };
}

/** Raw agreement direction for an L7 item, or null when weak or missing. */
export function signal(c: Content, itemId: string, answers: Answers): Direction | null {
  const v = answers[itemId];
  if (!isInt(v)) return null;
  const x = v - c.config.likert.center;
  const t = c.config.statements.min_abs_raw_for_signal;
  return x >= t ? "agree" : x <= -t ? "disagree" : null;
}

export function statements(c: Content, oc: Outcome, answers: Answers): Statements {
  const persp = new Map(c.perspectives.perspectives.map((p) => [p.id, p]));
  const ranked = oc.ranked;
  const out: Statements = { common_ground: [], differences: [], unexpected: null };
  if (ranked.length === 0) return out;
  const closest = persp.get(ranked[0].id)!;
  for (const s of closest.signatures) {
    const d = signal(c, s.item, answers);
    if (d === s.direction) out.common_ground.push({ perspective: closest.id, item: s.item, direction: d });
    else if (d !== null) out.differences.push({ perspective: closest.id, item: s.item, direction: d });
  }
  out.common_ground = out.common_ground.slice(0, 2);
  out.differences = out.differences.slice(0, 1);
  // Farthest first, stopping before the closest.
  for (let n = ranked.length - 1; n >= 1 && out.unexpected === null; n--) {
    const p = persp.get(ranked[n].id)!;
    const s = p.signatures.find((sig) => signal(c, sig.item, answers) === sig.direction);
    if (s) out.unexpected = { perspective: p.id, item: s.item, direction: s.direction };
  }
  return out;
}

export function score(c: Content, answers: Answers): ScoreResult {
  const scores = constructScores(c, answers);
  const oc = outcome(c, scores, answers);
  return {
    versions: contentVersions(c),
    constructs: scores,
    outcome: oc,
    tension: tension(c, scores, answers),
    statements: statements(c, oc, answers),
  };
}

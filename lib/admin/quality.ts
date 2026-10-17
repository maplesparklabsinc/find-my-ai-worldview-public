// Response quality (issue #55, section 2): flags for a look, from the stored
// timings and answers. Nothing is deleted or left out because of a flag. Pure.
import type { Content } from "@/lib/content";
import type { Answers } from "@/lib/scoring";
import { FEW } from "./index";

/**
 * When a response is flagged.
 *  - tooFastShareOfMedian: total time under this share of the release's median
 *    total (only once the release has FEW responses, so the median means something).
 *  - minMedianStatementMs: or a median time per scored statement under this.
 *  - sameAnswerShare: this share or more of the answered scored statements have
 *    the same value ("straight-lined").
 */
export const QUALITY = { tooFastShareOfMedian: 1 / 3, minMedianStatementMs: 2_000, sameAnswerShare: 0.9 } as const;

export type QualityFlag = "too_fast" | "same_answer";

export const FLAG_LABELS: Record<QualityFlag, string> = { too_fast: "Too fast", same_answer: "Same answer" };

/** The input a flag needs: what was answered and how long each question took. */
export interface QualityInput {
  answers: Answers;
  timings_ms: Record<string, number>;
}

export interface Quality {
  totalMs: number;
  /** Median time on the scored statements answered, or null if none were timed. */
  medianStatementMs: number | null;
  flags: QualityFlag[];
}

/** The scored statements of the content's form (the agree/disagree items in the six sections). */
export function statementKeys(content: Content): string[] {
  const form = content.items.forms[content.config.form];
  return form ? form.blocks.flatMap((b) => b.items) : [];
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const totalMs = (timings: Record<string, number>) => Object.values(timings ?? {}).reduce((s, t) => s + (Number(t) || 0), 0);

/**
 * The release's median total time, used by "too fast". Null when the release
 * has fewer than FEW responses, which turns that part of the flag off.
 */
export function releaseMedianMs(totals: readonly number[]): number | null {
  return totals.length >= FEW ? median(totals) : null;
}

export function quality(statements: readonly string[], r: QualityInput, releaseMedian: number | null): Quality {
  const total = totalMs(r.timings_ms);
  const values = statements.map((k) => r.answers[k]).filter((v): v is number => typeof v === "number");
  const times = statements.map((k) => r.timings_ms?.[k]).filter((t): t is number => typeof t === "number");
  const medianStatement = median(times);

  const flags: QualityFlag[] = [];
  const relative = releaseMedian !== null && total < releaseMedian * QUALITY.tooFastShareOfMedian;
  const perStatement = medianStatement !== null && medianStatement < QUALITY.minMedianStatementMs;
  if (relative || perStatement) flags.push("too_fast");

  if (values.length > 0) {
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    if (Math.max(...counts.values()) / values.length >= QUALITY.sameAnswerShare) flags.push("same_answer");
  }
  return { totalMs: total, medianStatementMs: medianStatement, flags };
}

/** "Too fast", "Same answer", both, or "" for neither. */
export function flagsLabel(flags: readonly QualityFlag[]): string {
  return flags.map((f) => FLAG_LABELS[f]).join(", ");
}

/** `?check=` on the responses list. */
export type CheckFilter = "flagged" | "clean";

export function parseCheckFilter(raw: unknown): CheckFilter | null {
  return raw === "flagged" || raw === "clean" ? raw : null;
}

/** "4 min 12 s", "48 s". */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

// Friend comparison (docs/02-scoring-spec.md section 6), ported from compare()
// in reference/score.py.
import type { Content } from "@/lib/content";
import { pyRound } from "./round";
import { constructScores, signal } from "./score";
import type { Answers, CompareResult, CompareRow } from "./types";

function byStrengthThenItem(a: CompareRow, b: CompareRow): number {
  if (a.strength !== b.strength) return b.strength - a.strength;
  return a.item < b.item ? -1 : a.item > b.item ? 1 : 0;
}

export function compare(c: Content, a: Answers, b: Answers): CompareResult {
  const sa = constructScores(c, a);
  const sb = constructScores(c, b);
  const center = c.config.likert.center;

  const gaps: Record<string, number | null> = {};
  for (const k of Object.keys(sa)) {
    const x = sa[k].score;
    const y = sb[k].score;
    gaps[k] = x !== null && y !== null ? pyRound(Math.abs(x - y), 4) : null;
  }

  const agree: CompareRow[] = [];
  const disagree: CompareRow[] = [];
  for (const item of c.itemsById.values()) {
    if (item.format !== "L7" || !item.forms.includes(c.config.form)) continue;
    const da = signal(c, item.id, a);
    const db = signal(c, item.id, b);
    if (da && db) {
      const strength = Math.abs((a[item.id] as number) - center) + Math.abs((b[item.id] as number) - center);
      (da === db ? agree : disagree).push({ item: item.id, a: da, b: db, strength });
    }
  }
  agree.sort(byStrengthThenItem);
  disagree.sort(byStrengthThenItem);

  // Largest gap; ties go to the later construct ID, as Python's max on (gap, id).
  let biggest: string | null = null;
  for (const [k, g] of Object.entries(gaps)) {
    if (g === null) continue;
    const bg = biggest === null ? null : gaps[biggest]!;
    if (bg === null || g > bg || (g === bg && k > biggest!)) biggest = k;
  }

  // No gap anywhere: there is no "furthest apart" to point to.
  if (biggest !== null && gaps[biggest] === 0) biggest = null;

  return { gaps, biggest_gap: biggest, agree: agree.slice(0, 3), disagree: disagree.slice(0, 3) };
}

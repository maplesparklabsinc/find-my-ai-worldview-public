// Who sees the quick check, and which description (docs/04 section 6): a random
// 25% of people; of those, half rate their own closest perspective and half a
// different one picked at random. Drawn from the person's stored seed, so a
// refresh never changes it and the draw can be checked later.
import type { Content } from "@/lib/content";
import { mulberry32 } from "@/lib/form";
import type { ScoreResult } from "@/lib/scoring";

export interface QuickCheckPlan {
  shown: "own" | "other";
  perspective: string;
}

/** Mixed into the seed so this draw is independent of the question order. */
const SALT = 0x51c3_a7e9;

export function quickCheckPlan(
  c: Content,
  seed: number,
  result: ScoreResult,
  shares: { show: number; own: number },
): QuickCheckPlan | null {
  const closest = result.outcome.ranked[0]?.id;
  if (!closest) return null;
  const rand = mulberry32((seed ^ SALT) >>> 0);
  if (rand() >= shares.show) return null;
  if (rand() < shares.own) return { shown: "own", perspective: closest };
  const others = c.perspectives.perspectives.map((p) => p.id).filter((id) => id !== closest);
  return { shown: "other", perspective: others[Math.floor(rand() * others.length)] };
}

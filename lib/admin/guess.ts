// "Guess matched?" on the admin pages (PR #65 review, item 6): how the guess
// made before the result compares with the result. Pure.
//  - yes: the result is what they guessed (lib/prediction landedAsExpected).
//  - close: they guessed one perspective and landed In between it and another,
//    or guessed In between two and landed on one of them.
//  - no: anything else.
//  - null: no guess (skipped, or never asked).
import { landedAsExpected, type Prediction } from "@/lib/prediction";
import type { Outcome } from "@/lib/scoring";

export type GuessMatch = "yes" | "close" | "no";

export interface GuessInput {
  prediction_kind: string | null;
  prediction_perspectives: string[] | null;
  outcome_type: string;
  outcome_reason: string | null;
  /** The first two perspectives in the stored ranking. */
  first: string | null;
  second: string | null;
}

function prediction(r: GuessInput): Prediction | null {
  const ids = r.prediction_perspectives ?? [];
  switch (r.prediction_kind) {
    case "perspective":
      return ids.length === 1 ? { kind: "perspective", perspectives: [ids[0]] } : null;
    case "between":
      return ids.length === 2 ? { kind: "between", perspectives: [ids[0], ids[1]] } : null;
    case "own_combination":
    case "forming":
    case "not_priority":
      return { kind: r.prediction_kind };
    default:
      return null;
  }
}

export function guessMatch(r: GuessInput): GuessMatch | null {
  if (!r.prediction_kind || r.prediction_kind === "skipped") return null;
  const p = prediction(r);
  if (!p) return "no";
  const ranked = [r.first, r.second].filter((x): x is string => !!x).map((id) => ({ id, name: id, distance: 0 }));
  const outcome = { type: r.outcome_type, reason: r.outcome_reason ?? undefined, ranked } as Outcome;
  if (landedAsExpected(p, outcome)) return "yes";
  const guessed = r.prediction_perspectives ?? [];
  const pair = [r.first, r.second];
  if (p.kind === "perspective" && r.outcome_type === "mixed_between" && pair.includes(guessed[0])) return "close";
  if (p.kind === "between" && r.outcome_type === "matched" && r.first !== null && guessed.includes(r.first)) return "close";
  return "no";
}

export const GUESS_MATCH_LABELS: Record<GuessMatch, string> = { yes: "Yes", close: "Close", no: "No" };

export const guessMatchLabel = (m: GuessMatch | null) => (m ? GUESS_MATCH_LABELS[m] : "–");

/** Among those who guessed: how many, and the share that got it (Yes) and that were Close. */
export function guessSummary(matches: (GuessMatch | null)[]): { guessed: number; yes: number; close: number } {
  const made = matches.filter((m): m is GuessMatch => m !== null);
  return { guessed: made.length, yes: made.filter((m) => m === "yes").length, close: made.filter((m) => m === "close").length };
}

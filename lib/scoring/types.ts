import type { BandId, Versions } from "@/lib/content";

export type Direction = "agree" | "disagree";

export interface TradeoffAnswer {
  choice: 0 | 1;
  strength: "slightly" | "strongly";
}

/**
 * One answer. L7: 1..7. SC/CAT and confidence probes: 0-based option index.
 * TO: TradeoffAnswer. GRID: row label -> option index. TXT: free text.
 */
export type AnswerValue = number | string | TradeoffAnswer | Record<string, number>;

/** Answers keyed by item ID (confidence probes use "D3:<construct>"). A missing key means skipped. */
export type Answers = Record<string, AnswerValue>;

export interface ConstructScore {
  score: number | null;
  band: BandId | null;
  answered: number;
  expected: number;
}

export type ConstructScores = Record<string, ConstructScore>;

export interface RankedPerspective {
  id: string;
  name: string;
  distance: number;
}

/** Why a result is "Still forming". `middle` was added in scoring 0.3.0. */
export type UndecidedReason = "coverage" | "confidence" | "middle";

export type OutcomeType = "undecided" | "indifferent" | "mixed_unmatched" | "mixed_between" | "matched";

export type Outcome =
  | { type: "undecided"; reason: UndecidedReason; ranked: RankedPerspective[] }
  | { type: "indifferent"; ranked: RankedPerspective[] }
  | {
      type: "mixed_unmatched" | "mixed_between" | "matched";
      ranked: RankedPerspective[];
      /**
       * Unsure on at least half the "how settled" questions but answering
       * strongly (docs/02 section 3). Results saved before scoring 0.2.0 don't
       * have it; treat a missing value as false.
       */
      unsettled?: boolean;
    };

export type TensionResult =
  | { id: string; text: string; strength: number }
  | { id: "none"; text: string; strength: number; strongest_construct: string };

export interface StatementRef {
  perspective: string;
  item: string;
  direction: Direction;
}

export interface Statements {
  common_ground: StatementRef[];
  differences: StatementRef[];
  unexpected: StatementRef | null;
}

export interface ScoreResult {
  versions: Versions;
  constructs: ConstructScores;
  outcome: Outcome;
  tension: TensionResult | null;
  statements: Statements;
}

export interface CompareRow {
  item: string;
  a: Direction;
  b: Direction;
  strength: number;
}

export interface CompareResult {
  gaps: Record<string, number | null>;
  biggest_gap: string | null;
  agree: CompareRow[];
  disagree: CompareRow[];
}

// The optional guess after the last question, before the result (issue #24).
// Pure and safe in the browser. The guess never reaches the scorer: `score()`
// takes answers only, and nothing here is passed to it.
import { z } from "zod";
import type { Content } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";
import { render } from "@/lib/results";
import type { Outcome } from "@/lib/scoring";

/** The broad outcomes someone can guess, besides one perspective or a pair. */
export const BROAD_KINDS = ["own_combination", "forming", "not_priority"] as const;

const perspectiveId = z.string().regex(/^[a-z_]{1,40}$/);

export const predictionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("perspective"), perspectives: z.tuple([perspectiveId]) }),
  z
    .strictObject({ kind: z.literal("between"), perspectives: z.tuple([perspectiveId, perspectiveId]) })
    .refine((p) => p.perspectives[0] !== p.perspectives[1], "a pair needs two different perspectives"),
  z.strictObject({ kind: z.enum(BROAD_KINDS) }),
  /** Saw the question and chose not to guess. A missing prediction means an older tab that never saw it. */
  z.strictObject({ kind: z.literal("skipped") }),
]);

export type Prediction = z.infer<typeof predictionSchema>;
export type PredictionKind = Prediction["kind"];

/** The perspective IDs in a guess (none for the broad outcomes or a skip). */
export function predictedIds(p: Prediction): string[] {
  return "perspectives" in p ? [...p.perspectives] : [];
}

/** Checks a guess against the current perspectives. Returns an error message, or null when it is fine. */
export function predictionError(c: Content, p: Prediction): string | null {
  const known = new Set(c.perspectives.perspectives.map((x) => x.id));
  const bad = predictedIds(p).find((id) => !known.has(id));
  return bad ? `unknown perspective ${bad}` : null;
}

/** Whether the outcome is the one the person guessed. Never a judgement, only which sentence to use. */
export function landedAsExpected(p: Prediction, o: Outcome): boolean {
  const ids = o.ranked.map((r) => r.id);
  switch (p.kind) {
    case "perspective":
      return o.type === "matched" && ids[0] === p.perspectives[0];
    case "between":
      return o.type === "mixed_between" && [ids[0], ids[1]].sort().join() === [...p.perspectives].sort().join();
    case "own_combination":
      return o.type === "mixed_unmatched";
    case "forming":
      // Skipping too much to place someone is not the same as views still forming.
      return o.type === "undecided" && o.reason !== "coverage";
    case "not_priority":
      return o.type === "indifferent";
    case "skipped":
      return false;
  }
}

/**
 * The reflection sentence set beside the result, or null after a skip.
 * Expected names come from the current perspectives; the result's own names
 * come from the stored ranking, as scored.
 */
export function reflectionText(c: Content, copy: CopyFile, p: Prediction, o: Outcome): string | null {
  if (p.kind === "skipped") return null;
  const r = copy.reflection;
  const nameOf = (id: string) => c.perspectives.perspectives.find((x) => x.id === id)?.name ?? id;
  const [e1, e2] = predictedIds(p).map(nameOf);
  const expected = { p1: e1 ?? "", p2: e2 ?? "" };
  if (landedAsExpected(p, o)) return render(r.same[p.kind], expected);
  const actualKey =
    o.type === "undecided" ? (o.reason === "middle" ? "undecided_middle" : o.reason === "coverage" ? "undecided_coverage" : "undecided") : o.type;
  const actual = render(r.actual[actualKey], { p1: o.ranked[0]?.name ?? "", p2: o.ranked[1]?.name ?? "" });
  return `${render(r.expected[p.kind], expected)} ${actual}`;
}

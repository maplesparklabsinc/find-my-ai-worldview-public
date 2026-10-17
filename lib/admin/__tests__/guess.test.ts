// PR #65 review, item 6: "Guess matched?".
import { describe, expect, it } from "vitest";
import { guessMatch, guessMatchLabel, guessSummary, type GuessInput } from "@/lib/admin/guess";

const g = (kind: string | null, ids: string[] | null, outcome: string, first: string | null, second: string | null, reason: string | null = null): GuessInput => ({
  prediction_kind: kind,
  prediction_perspectives: ids,
  outcome_type: outcome,
  outcome_reason: reason,
  first,
  second,
});

describe("guess matched", () => {
  it("yes when the result is what they guessed", () => {
    expect(guessMatch(g("perspective", ["stewards"], "matched", "stewards", "pragmatists"))).toBe("yes");
    expect(guessMatch(g("between", ["pragmatists", "stewards"], "mixed_between", "stewards", "pragmatists"))).toBe("yes");
    expect(guessMatch(g("own_combination", null, "mixed_unmatched", "stewards", "pragmatists"))).toBe("yes");
    expect(guessMatch(g("forming", null, "undecided", "stewards", null, "confidence"))).toBe("yes");
    expect(guessMatch(g("not_priority", null, "indifferent", null, null))).toBe("yes");
  });

  it("close when one perspective was guessed and the result is In between it and another, or the reverse", () => {
    expect(guessMatch(g("perspective", ["stewards"], "mixed_between", "pragmatists", "stewards"))).toBe("close");
    expect(guessMatch(g("between", ["pragmatists", "stewards"], "matched", "stewards", "accelerators"))).toBe("close");
  });

  it("no otherwise", () => {
    expect(guessMatch(g("perspective", ["stewards"], "matched", "pragmatists", "stewards"))).toBe("no");
    expect(guessMatch(g("perspective", ["skeptics"], "mixed_between", "pragmatists", "stewards"))).toBe("no");
    expect(guessMatch(g("between", ["pragmatists", "stewards"], "matched", "accelerators", "stewards"))).toBe("no");
    expect(guessMatch(g("between", ["pragmatists", "stewards"], "mixed_between", "stewards", "accelerators"))).toBe("no");
    // Skipping too much to be placed isn't "still forming".
    expect(guessMatch(g("forming", null, "undecided", "stewards", null, "coverage"))).toBe("no");
    expect(guessMatch(g("perspective", [], "matched", "stewards", null))).toBe("no");
  });

  it("no guess: skipped or never asked", () => {
    expect(guessMatch(g("skipped", null, "matched", "stewards", "pragmatists"))).toBeNull();
    expect(guessMatch(g(null, null, "matched", "stewards", "pragmatists"))).toBeNull();
    expect([guessMatchLabel("yes"), guessMatchLabel("close"), guessMatchLabel("no"), guessMatchLabel(null)]).toEqual(["Yes", "Close", "No", "–"]);
  });

  it("summary counts only those who guessed", () => {
    expect(guessSummary(["yes", "close", "no", null, "yes"])).toEqual({ guessed: 4, yes: 2, close: 1 });
  });
});

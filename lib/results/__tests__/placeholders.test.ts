// Every {placeholder} in the copy gets filled (issue #26). fill() once missed
// names with digits ({p1}, {p2}), so the In between share image read
// "Between {p1} and {p2}".
import { describe, expect, it } from "vitest";
import vectors from "@/reference/test-vectors.json";
import { cardAlt, cardText } from "@/components/share-card";
import copyJson from "@/content/copy.json";
import narrativesJson from "@/content/narratives.json";
import { getContent } from "@/lib/content";
import { fill, getCopy } from "@/lib/content/copy";
import { render, resultView } from "@/lib/results";
import { score, type Answers } from "@/lib/scoring";

/** Every string in a JSON value, with its path. */
function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

/** Anything in braces, whatever its spelling, so a placeholder fill() can't see still shows up here. */
const names = (s: string) => [...s.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);

describe("placeholders", () => {
  const all = [...strings(copyJson, "copy"), ...strings(narrativesJson, "narratives")].filter(([, s]) => names(s).length > 0);

  it("are found in the copy (the check below isn't empty)", () => {
    expect(all.some(([, s]) => s.includes("{p1}"))).toBe(true);
  });

  it("are all filled by fill() and render() with the values they are used with", () => {
    for (const [path, s] of all) {
      const values = Object.fromEntries(names(s).map((n) => [n, "X"]));
      expect(fill(s, values), path).not.toMatch(/[{}]/);
      expect(render(s, values), path).not.toMatch(/[{}]/);
    }
  });
});

describe("share card text", () => {
  const c = getContent();
  const copy = getCopy();
  const viewOf = (id: string) => {
    const answers = vectors.score_cases.find((v) => v.id === id)!.answers as Answers;
    return resultView(c, copy, score(c, answers), answers);
  };

  it("names both perspectives on an In between card and its alt text", () => {
    const view = viewOf("mixed_between");
    const [a, b] = view.ranking;
    const source = { view, headline: view.headline };
    for (const text of [cardText(source).title, cardAlt(source)]) {
      expect(text).toContain(a.name);
      expect(text).toContain(b.name);
      expect(text).not.toMatch(/[{}]/);
    }
  });

  it("leaves no placeholder on any outcome's card", () => {
    for (const id of ["steward", "mixed_between", "mixed_unmatched", "undecided_confidence", "undecided_coverage", "indifferent"]) {
      const view = viewOf(id);
      const t = cardText({ view, headline: view.headline });
      const words = [t.label, t.title, t.line, t.summary, ...t.pair.flatMap((p) => [p.name, p.summary])];
      expect(words.join(" "), id).not.toMatch(/[{}]/);
      expect(cardAlt({ view, headline: view.headline }), id).not.toMatch(/[{}]/);
    }
  });

  // Issue #28: a one-line summary per perspective on the card.
  it("shows the closest perspective's tagline and summary", () => {
    const view = viewOf("steward");
    const p = c.perspectives.perspectives.find((x) => x.id === "stewards")!;
    const t = cardText({ view, headline: view.headline });
    expect(t).toMatchObject({ label: copy.share.card.label_matched, title: p.name, line: p.tagline, summary: p.card_summary, pair: [] });
  });

  it("shows both names and both summaries for In between, without the old subtitle", () => {
    const view = viewOf("mixed_between");
    const t = cardText({ view, headline: view.headline });
    const [a, b] = view.ranking.map((r) => c.perspectives.perspectives.find((x) => x.id === r.id)!);
    expect(t.pair).toEqual([
      { name: a.name, summary: a.card_summary },
      { name: b.name, summary: b.card_summary },
    ]);
    expect(t.line).toBe("");
    expect(t.summary).toBe("");
  });

  it("shows each other outcome's subtitle and no summary", () => {
    const card = copy.share.card;
    for (const [id, key] of [
      ["mixed_unmatched", "mixed_unmatched"],
      ["undecided_confidence", "undecided"],
      ["all_neither_settled", "undecided_middle"],
      ["indifferent", "indifferent"],
    ] as const) {
      const view = viewOf(id);
      const t = cardText({ view, headline: view.headline });
      expect(t, id).toMatchObject({ label: card.label_other, title: card.title[key], line: card.subtitle[key], summary: "", pair: [] });
    }
  });

  it("shows the tagline only for a release without summaries", () => {
    const view = viewOf("steward");
    const old = { ...view, ranking: view.ranking.map((p) => ({ ...p, cardSummary: null })) };
    const t = cardText({ view: old, headline: view.headline });
    expect(t.line).toBe(view.ranking[0].tagline);
    expect(t.summary).toBe("");
  });
});

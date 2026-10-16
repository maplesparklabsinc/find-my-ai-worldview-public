import { describe, expect, it } from "vitest";
import itemsJson from "@/content/items.json";
import perspectivesJson from "@/content/perspectives.json";
import scoringConfigJson from "@/content/scoring-config.json";
import narrativesJson from "@/content/narratives.json";
import baseRatesJson from "@/content/base-rates.json";
import { getContent, parseContent, type RawContent } from "@/lib/content";

const raw = (): RawContent =>
  structuredClone({
    items: itemsJson,
    config: scoringConfigJson,
    perspectives: perspectivesJson,
    narratives: narrativesJson,
    baseRates: baseRatesJson,
  });

describe("content loaders", () => {
  it("parse every file in content/ and pass the cross-checks", () => {
    const c = getContent();
    expect(c.itemsById.size).toBe(c.items.items.length);
    expect(c.perspectives.perspectives).toHaveLength(7);
    expect(c.config.scored_constructs).toEqual(["C1", "C2", "C3", "C4", "C5", "C6"]);
    expect(c.baseRates.items.length).toBeGreaterThan(0);
  });

  it("reject unknown fields", () => {
    const r = raw();
    (r.config as Record<string, unknown>).surprise = 1;
    expect(() => parseContent(r)).toThrow();
  });

  it("reject a form that points at a missing item", () => {
    const r = raw();
    (r.items as typeof itemsJson).forms.S.after_blocks.push("NOPE");
    expect(() => parseContent(r)).toThrow(/unknown item NOPE/);
  });

  it("reject a signature on an item that is not a statement", () => {
    const r = raw();
    (r.perspectives as typeof perspectivesJson).perspectives[0].signatures[0].item = "S1";
    expect(() => parseContent(r)).toThrow(/S1 is not L7/);
  });

  it("reject a tension on an unknown trust row", () => {
    const r = raw();
    const t = (r.narratives as typeof narrativesJson).tensions.find((x) => x.id === "oversight_without_trust")!;
    (t.when[1] as { trust_low: string }).trust_low = "Nobody";
    expect(() => parseContent(r)).toThrow(/unknown trust row/);
  });

  it("require the names people use elsewhere from taxonomy 0.3.0, and not before (issue #39)", () => {
    const r = raw();
    const file = r.perspectives as { taxonomy_version: string; perspectives: { elsewhere?: string }[] };
    delete file.perspectives[3].elsewhere;
    expect(() => parseContent(r)).toThrow(/elsewhere/);
    file.taxonomy_version = "0.2.2";
    expect(() => parseContent(r)).not.toThrow();
  });

  it("reject a base rate without its source", () => {
    const r = raw();
    delete (r.baseRates as { items: Record<string, unknown>[] }).items[0].source;
    expect(() => parseContent(r)).toThrow();
  });

  // The short texts fill "Like {perspective}, you don't think {short}", "Neither
  // of you thinks {short}" and "You split on whether {short}" (issue #28).
  it("keep every short text in the current form free of negatives and sentence-shaped", () => {
    const c = getContent();
    for (const item of c.items.items) {
      if (!item.short || !item.forms.includes(c.config.form)) continue;
      const s = item.short;
      for (const bad of ["n't", " not ", " no ", " little "]) expect(` ${s} `.includes(bad), `${item.id}: "${bad}"`).toBe(false);
      expect(/^you\b/i.test(s), `${item.id} starts with "you"`).toBe(false);
      // Lower case unless the first word is an abbreviation such as "AI".
      const first = s.split(/[\s']/)[0];
      expect(first === first.toLowerCase() || first === first.toUpperCase(), `${item.id} starts lower case`).toBe(true);
      expect(s.endsWith("."), `${item.id} has no full stop`).toBe(false);
    }
  });
});

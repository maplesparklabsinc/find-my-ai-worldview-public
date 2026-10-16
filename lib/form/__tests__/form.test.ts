import { describe, expect, it } from "vitest";
import { getContent } from "@/lib/content";
import { buildSequence, mulberry32, shownOptions, shuffle, standardSequence, SEQUENCE_VERSION } from "@/lib/form";

const c = getContent();
const form = c.items.forms.S;
const seeds = [0, 1, 42, 12345, 2 ** 31, 0xffffffff, ...Array.from({ length: 200 }, (_, n) => (n * 2654435761) >>> 0)];

describe("standard form sequence", () => {
  it("is the same for the same seed", () => {
    for (const s of seeds.slice(0, 20)) expect(standardSequence(c, s)).toStrictEqual(standardSequence(c, s));
  });

  it("keeps a stable order for a stored seed (changing this breaks stored responses; bump SEQUENCE_VERSION)", () => {
    expect(SEQUENCE_VERSION).toBe("2");
    expect(standardSequence(c, 12345).direction).toBe("disagree_first");
    expect(mulberry32(12345)()).toBe(0.9797282677609473);
    expect(standardSequence(c, 12345).steps.map((s) => s.key)).toMatchSnapshot();
  });

  it("asks every form question exactly once", () => {
    const expected = [
      ...form.intro,
      ...Object.values(form.pinned_before_block).flat(),
      ...form.blocks.flatMap((b) => [...b.items, `${b.confidence_probe}:${b.construct}`]),
      ...form.after_blocks,
      ...form.outro,
    ].sort();
    for (const s of seeds) {
      const keys = standardSequence(c, s).steps.map((x) => x.key);
      expect([...keys].sort()).toEqual(expected);
    }
  });

  it("has 45 questions plus 6 confidence probes", () => {
    const steps = standardSequence(c, 1).steps;
    expect(steps.filter((s) => s.kind !== "confidence_probe")).toHaveLength(45);
    expect(steps.filter((s) => s.kind === "confidence_probe")).toHaveLength(6);
  });

  it("shows S1 first after the six sections, outside any section", () => {
    for (const s of seeds) {
      const steps = standardSequence(c, s).steps;
      const i = steps.findIndex((x) => x.key === "S1");
      const lastProbe = steps.map((x) => x.kind).lastIndexOf("confidence_probe");
      expect(i).toBe(lastProbe + 1);
      expect(steps[i].sectionConstruct).toBeNull();
    }
  });

  it("keeps each section together and ends it with its confidence probe", () => {
    for (const s of seeds) {
      const seq = standardSequence(c, s);
      const sections = seq.steps.filter((x) => x.part === "section");
      expect(seq.sectionCount).toBe(6);
      for (let n = 1; n <= 6; n++) {
        const idx = seq.steps.flatMap((x, i) => (x.section === n ? [i] : []));
        expect(idx[idx.length - 1] - idx[0]).toBe(idx.length - 1);
        const last = seq.steps[idx[idx.length - 1]];
        expect(last.kind).toBe("confidence_probe");
        expect(last.key).toBe(`D3:${last.sectionConstruct}`);
      }
      // Sections come first, then after_blocks then outro in listed order, except
      // that the trade-off cards swap places among themselves.
      expect(seq.steps.slice(0, sections.length).every((x) => x.part === "section")).toBe(true);
      const swap = form.after_blocks_shuffled ?? [];
      const rest = seq.steps.slice(sections.length).map((x) => (swap.includes(x.key) ? "*" : x.key));
      expect(rest).toEqual([...form.after_blocks.map((id) => (swap.includes(id) ? "*" : id)), ...form.outro]);
    }
  });

  it("shuffles the four trade-off cards, CX-T1 among them, between S1 and the scenarios", () => {
    expect(form.after_blocks_shuffled).toEqual(["C3-T1", "C4-T1", "C5-T1", "CX-T1"]);
    const cxPlace = new Set<number>();
    for (const s of seeds) {
      const steps = standardSequence(c, s).steps;
      const s1 = steps.findIndex((x) => x.key === "S1");
      const cards = steps.slice(s1 + 1, s1 + 5);
      expect(cards.map((x) => c.itemsById.get(x.itemId)!.format)).toEqual(["TO", "TO", "TO", "TO"]);
      expect(cards.every((x) => x.part === "after_sections")).toBe(true);
      cxPlace.add(cards.findIndex((x) => x.key === "CX-T1"));
      expect(steps.filter((x) => x.key === "CX-T1")).toHaveLength(1);
    }
    expect([...cxPlace].sort()).toEqual([0, 1, 2, 3]);
  });

  it("keeps sections, items and direction as in sequence version 1", () => {
    // Shuffling the trade-off cards draws last, so nothing else moved.
    const v1 = buildSequence({ ...form, after_blocks_shuffled: undefined }, "S", 12345);
    const v2 = standardSequence(c, 12345);
    expect(v2.direction).toBe(v1.direction);
    const inSections = (q: typeof v1) => q.steps.filter((x) => x.part === "section").map((x) => x.key);
    expect(inSections(v2)).toEqual(inSections(v1));
  });

  it("actually shuffles sections and items across seeds", () => {
    const sectionOrders = new Set<string>();
    const firstItems = new Set<string>();
    for (const s of seeds) {
      const steps = standardSequence(c, s).steps;
      sectionOrders.add(steps.filter((x) => x.kind === "confidence_probe").map((x) => x.sectionConstruct).join());
      firstItems.add(steps.find((x) => x.sectionConstruct === "C1" && x.kind === "item")!.key);
    }
    expect(sectionOrders.size).toBeGreaterThan(50);
    expect(firstItems.size).toBe(5);
  });

  it("rejects seeds that cannot be stored as unsigned 32-bit integers", () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) expect(() => buildSequence(form, "S", bad)).toThrow();
  });
});

describe("answer direction", () => {
  const labels = c.items.likert_labels;
  const item = (id: string) => c.itemsById.get(id)!;

  it("is fixed by the seed and splits people about evenly", () => {
    expect(standardSequence(c, 12345).direction).toBe(standardSequence(c, 12345).direction);
    let agreeFirst = 0;
    for (let s = 0; s < 4000; s++) if (standardSequence(c, s).direction === "agree_first") agreeFirst++;
    expect(Math.abs(agreeFirst - 2000)).toBeLessThan(150);
  });

  it("flips agree/disagree options but keeps stored values canonical", () => {
    const down = shownOptions(item("C5-01"), "disagree_first", labels);
    const up = shownOptions(item("C5-01"), "agree_first", labels);
    expect(down.map((o) => o.label)).toEqual(labels);
    expect(down.map((o) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(up.map((o) => o.label)).toEqual([...labels].reverse());
    expect(up.map((o) => o.value)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(up.find((o) => o.label === "Strongly agree")!.value).toBe(7);
  });

  it("flips the two trade-off cards and nothing else", () => {
    const to = item("C3-T1");
    expect(shownOptions(to, "agree_first", labels).map((o) => o.value)).toEqual([1, 0]);
    expect(shownOptions(to, "disagree_first", labels).map((o) => o.value)).toEqual([0, 1]);
    for (const id of ["S1", "D3", "D8", "D11"]) {
      expect(shownOptions(item(id), "agree_first", labels).map((o) => o.value)).toEqual(item(id).options.map((_, i) => i));
    }
  });
});

describe("shuffle", () => {
  it("returns a permutation and leaves the input alone", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    const out = shuffle(xs, mulberry32(9));
    expect([...out].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("is roughly uniform", () => {
    const rand = mulberry32(3);
    const counts = [0, 0, 0, 0];
    for (let n = 0; n < 40000; n++) counts[shuffle([0, 1, 2, 3], rand)[0]]++;
    for (const k of counts) expect(Math.abs(k - 10000)).toBeLessThan(500);
  });
});

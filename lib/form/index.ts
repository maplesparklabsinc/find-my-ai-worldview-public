// Question order for a form (docs/01-product-spec.md section 5.3).
//
// Section order and item order inside each section are shuffled per person
// with a stored seed, so the order can always be rebuilt from the seed. Items
// pinned before a section (S1 before pace) come right before its first item.
// Each section ends with its confidence probe. Trade-offs, scenarios and the
// "a few about you" questions follow in their listed order, except that the
// items in after_blocks_shuffled (the trade-off cards) swap places among
// themselves per person (sequence version 2).
//
// The same seed also fixes the answer direction (docs/01-product-spec.md 5.3):
// half of people see agree/disagree options disagree-first, half agree-first,
// for the whole quiz, and the two trade-off cards flip with it. Answers are
// always stored in canonical order whatever was shown.
//
// Changing anything here changes the order stored seeds produce. If you must,
// bump SEQUENCE_VERSION so stored responses can tell which algorithm they used.
import type { Content, Form, Item } from "@/lib/content";

export const SEQUENCE_VERSION = "2";

export type StepPart = "intro" | "section" | "after_sections" | "outro";

export interface Step {
  /** Key the answer is stored under: the item ID, or "D3:<construct>" for a confidence probe. */
  key: string;
  itemId: string;
  part: StepPart;
  /** 1-based position among the shuffled sections ("Part 2 of 6"), or null outside them. */
  section: number | null;
  /** The construct of the section this step belongs to, or null outside them. */
  sectionConstruct: string | null;
  kind: "item" | "pinned" | "confidence_probe";
}

export type AnswerDirection = "disagree_first" | "agree_first";

export interface Sequence {
  form: string;
  seed: number;
  sequenceVersion: string;
  /** Order agree/disagree options and trade-off cards are shown in. Store with the response. */
  direction: AnswerDirection;
  sectionCount: number;
  steps: Step[];
}

/** A fresh random seed (unsigned 32-bit) for a new respondent. */
export function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

export function isValidSeed(seed: number): boolean {
  return Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

/** mulberry32: small, fast, well-known 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildSequence(form: Form, formId: string, seed: number): Sequence {
  if (!isValidSeed(seed)) throw new Error(`seed must be an unsigned 32-bit integer, got ${seed}`);
  const rand = mulberry32(seed);
  // Draw order matters for reproducibility: sections first, then items in each
  // section in its shuffled position.
  const blocks = shuffle(form.blocks, rand).map((b) => ({ ...b, items: shuffle(b.items, rand) }));

  const steps: Step[] = [];
  const plain = (part: StepPart) => (id: string) =>
    steps.push({ key: id, itemId: id, part, section: null, sectionConstruct: null, kind: "item" });

  form.intro.forEach(plain("intro"));
  blocks.forEach((b, n) => {
    const at = { part: "section" as const, section: n + 1, sectionConstruct: b.construct };
    for (const id of form.pinned_before_block[b.construct] ?? []) steps.push({ key: id, itemId: id, kind: "pinned", ...at });
    for (const id of b.items) steps.push({ key: id, itemId: id, kind: "item", ...at });
    steps.push({ key: `${b.confidence_probe}:${b.construct}`, itemId: b.confidence_probe, kind: "confidence_probe", ...at });
  });
  // Drawn after the section shuffles so adding it left the question order unchanged.
  const direction: AnswerDirection = rand() < 0.5 ? "disagree_first" : "agree_first";

  // Drawn last, so sections, items and direction are the same as in sequence version 1.
  const swap = form.after_blocks_shuffled ?? [];
  const swapped = shuffle(swap, rand);
  form.after_blocks.map((id) => (swap.includes(id) ? swapped[swap.indexOf(id)] : id)).forEach(plain("after_sections"));
  form.outro.forEach(plain("outro"));

  return { form: formId, seed: seed >>> 0, sequenceVersion: SEQUENCE_VERSION, direction, sectionCount: blocks.length, steps };
}

/** The standard form's sequence for a seed, from the current content. */
export function standardSequence(c: Content, seed: number): Sequence {
  const formId = c.config.form;
  return buildSequence(c.items.forms[formId], formId, seed);
}

/** How many screens the standard form has: the "{n} quick questions" in site copy. Every seed gives the same number. */
export function screenCount(c: Content): number {
  return standardSequence(c, 0).steps.length;
}

export function stepItem(c: Content, step: Step): Item {
  const item = c.itemsById.get(step.itemId);
  if (!item) throw new Error(`unknown item ${step.itemId}`);
  return item;
}

export interface ShownOption {
  /** The label as shown. */
  label: string;
  /** What is stored when this option is picked: 1..7 for L7, the option index for everything else. */
  value: number;
}

/**
 * The options of an item in the order this person sees them. Only agree/disagree
 * items (L7) and trade-off cards (TO) follow the direction; every other list
 * keeps its listed order. Stored values are always canonical.
 */
export function shownOptions(item: Item, direction: AnswerDirection, likertLabels: readonly string[]): ShownOption[] {
  let opts: ShownOption[];
  if (item.format === "L7") opts = likertLabels.map((label, i) => ({ label, value: i + 1 }));
  else opts = item.options.map((label, i) => ({ label, value: i }));
  const flips = item.format === "L7" || item.format === "TO";
  return flips && direction === "agree_first" ? opts.reverse() : opts;
}

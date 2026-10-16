// Typed loaders for content/. The JSON is bundled at build time, parsed with the
// schemas in ./schemas, then checked for references between files (form items
// exist, signatures point at scored statements, and so on).
import itemsJson from "@/content/items.json";
import scoringConfigJson from "@/content/scoring-config.json";
import perspectivesJson from "@/content/perspectives.json";
import narrativesJson from "@/content/narratives.json";
import baseRatesJson from "@/content/base-rates.json";
import {
  baseRatesFileSchema,
  itemsFileSchema,
  narrativesFileSchema,
  perspectivesFileSchema,
  scoringConfigSchema,
  type BaseRatesFile,
  type Item,
  type ItemsFile,
  type NarrativesFile,
  type PerspectivesFile,
  type ScoringConfig,
} from "./schemas";

export * from "./schemas";

export interface Content {
  items: ItemsFile;
  /** Items keyed by ID, in the order they appear in items.json. */
  itemsById: ReadonlyMap<string, Item>;
  config: ScoringConfig;
  perspectives: PerspectivesFile;
  narratives: NarrativesFile;
  baseRates: BaseRatesFile;
}

export interface Versions {
  scoring: string;
  taxonomy: string;
  item_bank: string;
  narratives: string;
}

export interface RawContent {
  items: unknown;
  config: unknown;
  perspectives: unknown;
  narratives: unknown;
  baseRates: unknown;
}

/** Parse and cross-check raw content. Throws with every problem found. */
export function parseContent(raw: RawContent): Content {
  const items = itemsFileSchema.parse(raw.items);
  const config = scoringConfigSchema.parse(raw.config);
  const perspectives = perspectivesFileSchema.parse(raw.perspectives);
  const narratives = narrativesFileSchema.parse(raw.narratives);
  const baseRates = baseRatesFileSchema.parse(raw.baseRates);

  const itemsById = new Map<string, Item>();
  const problems: string[] = [];
  for (const item of items.items) {
    if (itemsById.has(item.id)) problems.push(`duplicate item id ${item.id}`);
    itemsById.set(item.id, item);
  }

  const content: Content = { items, itemsById, config, perspectives, narratives, baseRates };
  problems.push(...crossCheck(content));
  if (problems.length > 0) {
    throw new Error(`Content failed cross-checks:\n- ${problems.join("\n- ")}`);
  }
  return content;
}

function crossCheck(c: Content): string[] {
  const out: string[] = [];
  const { config, itemsById } = c;
  const scored = config.scored_constructs;
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  const form = c.items.forms[config.form];
  if (!form) return [`scoring form ${config.form} missing from items.json`];

  const need = (id: string, where: string, check?: (i: Item) => string | null) => {
    const item = itemsById.get(id);
    if (!item) {
      out.push(`${where}: unknown item ${id}`);
      return;
    }
    if (!item.forms.includes(config.form)) out.push(`${where}: ${id} is not in form ${config.form}`);
    const msg = check?.(item);
    if (msg) out.push(`${where}: ${id} ${msg}`);
  };

  const blockConstructs = form.blocks.map((b) => b.construct);
  if (!sameSet(blockConstructs, scored)) out.push("form blocks do not match scored_constructs");
  for (const b of form.blocks) {
    need(b.confidence_probe, `block ${b.construct} probe`);
    for (const id of b.items) {
      need(id, `block ${b.construct}`, (i) =>
        i.format !== "L7" ? "is not L7" : i.construct !== b.construct ? `belongs to ${i.construct}` : i.pole === null ? "has no pole" : null,
      );
    }
  }
  for (const [k, ids] of Object.entries(form.pinned_before_block)) {
    if (!blockConstructs.includes(k)) out.push(`pinned_before_block: no block ${k}`);
    ids.forEach((id) => need(id, `pinned before ${k}`));
  }
  [...form.intro, ...form.after_blocks, ...form.outro].forEach((id) => need(id, "form"));
  for (const id of form.after_blocks_shuffled ?? []) {
    if (!form.after_blocks.includes(id)) out.push(`after_blocks_shuffled: ${id} is not in after_blocks`);
  }
  const all = [
    ...form.intro,
    ...Object.values(form.pinned_before_block).flat(),
    ...form.blocks.flatMap((b) => b.items),
    ...form.after_blocks,
    ...form.outro,
  ];
  const dupes = all.filter((id, n) => all.indexOf(id) !== n);
  if (dupes.length) out.push(`form lists items more than once: ${dupes.join(", ")}`);

  for (const id of [config.undecided.confidence_item, config.indifferent.salience_item]) need(id, "scoring-config");
  const trustRows = itemsById.get("D4")?.rows ?? [];
  if (trustRows.length === 0) out.push("D4 (trust grid) missing or has no rows");

  for (const p of c.perspectives.perspectives) {
    if (!sameSet(Object.keys(p.prototype), scored)) out.push(`${p.id}: prototype keys do not match scored_constructs`);
    if (!sameSet(Object.keys(p.weight), scored)) out.push(`${p.id}: weight keys do not match scored_constructs`);
    for (const s of p.signatures) {
      need(s.item, `${p.id} signature`, (i) => (i.format !== "L7" ? "is not L7" : i.short ? null : "has no short text"));
    }
  }
  const pids = c.perspectives.perspectives.map((p) => p.id);
  if (new Set(pids).size !== pids.length) out.push("duplicate perspective ids");

  if (!sameSet(Object.keys(c.narratives.constructs), scored)) out.push("narratives.constructs do not match scored_constructs");
  for (const t of c.narratives.tensions) {
    for (const cond of t.when) {
      if ("construct" in cond && !scored.includes(cond.construct)) out.push(`tension ${t.id}: unknown construct ${cond.construct}`);
      if ("trust_low" in cond && !trustRows.includes(cond.trust_low)) out.push(`tension ${t.id}: unknown trust row ${cond.trust_low}`);
      if ("tradeoff" in cond) need(cond.tradeoff, `tension ${t.id}`, (i) => (i.format === "TO" ? null : "is not a trade-off"));
    }
  }

  for (const r of c.baseRates.items) {
    if (r.item && !itemsById.has(r.item)) out.push(`base rate: unknown item ${r.item}`);
  }
  return out;
}

let cached: Content | null = null;

/** The current content bundle, parsed once per process. */
export function getContent(): Content {
  cached ??= parseContent({
    items: itemsJson,
    config: scoringConfigJson,
    perspectives: perspectivesJson,
    narratives: narrativesJson,
    baseRates: baseRatesJson,
  });
  return cached;
}

export function contentVersions(c: Content): Versions {
  return {
    scoring: c.config.scoring_version,
    taxonomy: c.perspectives.taxonomy_version,
    item_bank: c.items.item_bank_version,
    narratives: c.narratives.narratives_version,
  };
}

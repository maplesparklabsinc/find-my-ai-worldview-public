// Schemas for every file in content/. Objects are strict so a new or renamed
// field in the content fails loudly here instead of being silently ignored.
import { z } from "zod";

const version = z.string().regex(/^\d+\.\d+\.\d+$/);
const constructId = z.string().regex(/^C\d$/);

// ---------- items.json ----------

export const itemFormatSchema = z.enum(["L7", "TO", "SC", "CAT", "GRID", "TXT"]);

export const itemSchema = z.strictObject({
  id: z.string().min(1),
  construct: z.string().min(1),
  pole: z.enum(["+", "-"]).nullable(),
  stem: z.string().min(1),
  options: z.array(z.string().min(1)),
  rows: z.array(z.string().min(1)),
  short: z.string().min(1).nullable(),
  format: itemFormatSchema,
  forms: z.array(z.string().min(1)).min(1),
  priority: z.number().int(),
  flags: z.array(z.string().min(1)),
  source: z.string(),
});

export const formBlockSchema = z.strictObject({
  construct: constructId,
  confidence_probe: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
});

export const formSchema = z.strictObject({
  intro: z.array(z.string().min(1)),
  blocks: z.array(formBlockSchema).min(1),
  pinned_before_block: z.record(constructId, z.array(z.string().min(1))),
  after_blocks: z.array(z.string().min(1)),
  /** After-block items that swap places among themselves per person (item bank 0.6.0). Older releases have none. */
  after_blocks_shuffled: z.array(z.string().min(1)).optional(),
  outro: z.array(z.string().min(1)),
});

export const itemsFileSchema = z.strictObject({
  item_bank_version: version,
  likert_labels: z.array(z.string().min(1)).length(7),
  tradeoff_strength_labels: z.array(z.string().min(1)).length(2),
  definition_text: z.string().min(1),
  forms: z.record(z.string(), formSchema),
  items: z.array(itemSchema).min(1),
});

// ---------- scoring-config.json ----------

export const bandIdSchema = z.enum(["strong_low", "lean_low", "between", "lean_high", "strong_high"]);

export const scoringConfigSchema = z.strictObject({
  scoring_version: version,
  status: z.string(),
  likert: z.strictObject({ min: z.number().int(), max: z.number().int(), center: z.number().int() }),
  scored_constructs: z.array(constructId).min(1),
  form: z.string().min(1),
  min_items_per_construct: z.number().int().positive(),
  min_scored_constructs: z.number().int().positive(),
  bands: z
    .array(z.strictObject({ id: bandIdSchema, max_exclusive: z.number().nullable() }))
    .min(1)
    .refine((b) => b[b.length - 1].max_exclusive === null, "the last band must be open-ended"),
  undecided: z.strictObject({
    confidence_item: z.string().min(1),
    unsettled_options: z.array(z.number().int().nonnegative()),
    min_unsettled_share: z.number().min(0).max(1),
    max_mean_abs_score: z.number().nonnegative(),
    /** Every scored question under this absolute score: Still forming, reason `middle`. Added in scoring 0.3.0. */
    middle_max_abs_score: z.number().positive(),
    /** The probe option "Not something I have thought about" (scoring 0.4.0). */
    unconsidered_option: z.number().int().nonnegative(),
    /** With at least this many such probes, `max_mean_abs_score_unconsidered` replaces `max_mean_abs_score`. */
    min_unconsidered_probes: z.number().int().positive(),
    max_mean_abs_score_unconsidered: z.number().nonnegative(),
  }),
  indifferent: z.strictObject({
    salience_item: z.string().min(1),
    low_salience_options: z.array(z.number().int().nonnegative()),
    /** Not a priority needs C1 and C2 strictly below these (scoring 0.4.0; earlier releases had `max_C1`/`max_C2`). */
    below_C1: z.number(),
    below_C2: z.number(),
  }),
  match: z.strictObject({
    distance: z.literal("weighted_euclidean_normalized"),
    min_weight_share_evaluable: z.number().min(0).max(1),
    max_distance_for_match: z.number().positive(),
    tie_margin: z.number().nonnegative(),
  }),
  tension: z.strictObject({ min_strength: z.number().nonnegative() }),
  statements: z.strictObject({ min_abs_raw_for_signal: z.number().int().positive() }),
  trust_strength: z.record(z.string().regex(/^\d+$/), z.number().nonnegative()),
});

// ---------- perspectives.json ----------

const constructNumbers = z.record(constructId, z.number());

export const perspectiveSchema = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string().min(1),
  tagline: z.string().min(1),
  /** One line for the share image (taxonomy 0.2.1). Frozen releases before it have none. */
  card_summary: z.string().min(1),
  description: z.string().min(1),
  strongest_objection: z.string().min(1),
  discussion_prompt: z.string().min(1),
  /** The names people use for this view elsewhere, shown under Go deeper. Required from taxonomy 0.3.0. */
  elsewhere: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).optional(),
  prototype: constructNumbers,
  weight: z.record(constructId, z.number().nonnegative()),
  signatures: z
    .array(z.strictObject({ item: z.string().min(1), direction: z.enum(["agree", "disagree"]) }))
    .min(1),
});

export const perspectivesFileSchema = z
  .strictObject({
    taxonomy_version: version,
    status: z.string(),
    notes: z.string(),
    perspectives: z.array(perspectiveSchema).min(2),
    candidates_not_scored: z.array(
      z.strictObject({ id: z.string().min(1), name: z.string().min(1), note: z.string() }),
    ),
  })
  .superRefine((f, ctx) => {
    const [major, minor] = f.taxonomy_version.split(".").map(Number);
    if (major === 0 && minor < 3) return;
    f.perspectives.forEach((p, i) => {
      if (p.elsewhere === undefined) {
        ctx.addIssue({ code: "custom", path: ["perspectives", i, "elsewhere"], message: "required from taxonomy 0.3.0" });
      }
    });
  });

// ---------- narratives.json ----------

const tensionConditionSchema = z.union([
  z.strictObject({ construct: constructId, op: z.enum([">=", "<="]), value: z.number() }),
  z.strictObject({ trust_low: z.string().min(1) }),
  z.strictObject({ tradeoff: z.string().min(1), option: z.union([z.literal(0), z.literal(1)]) }),
]);

export const tensionSchema = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  when: z.array(tensionConditionSchema).min(1),
  text: z.string().min(1),
});

const outcomeBase = {
  headline: z.string().min(1),
  body: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)).optional(),
};

export const narrativesFileSchema = z.strictObject({
  narratives_version: version,
  voice: z.string(),
  constructs: z.record(
    constructId,
    z.strictObject({
      name: z.string().min(1),
      question: z.string().min(1),
      /** Short phrase for running text: "Accelerators on {topic}". */
      topic: z.string().min(1),
      low: z.string().min(1),
      high: z.string().min(1),
    }),
  ),
  bands: z.strictObject({
    strong_low: z.string().min(1),
    lean_low: z.string().min(1),
    between: z.string().min(1),
    lean_high: z.string().min(1),
    strong_high: z.string().min(1),
  }),
  unmeasured: z.string().min(1),
  /** Shown on a result whose outcome is `unsettled` (docs/02 section 3). Added in narratives 0.4.0. */
  unsettled_note: z.string().min(1),
  outcomes: z.strictObject({
    matched: z.strictObject({
      headline: z.string().includes("{p1}"),
      subhead: z.string().min(1),
    }),
    mixed_between: z.strictObject({
      ...outcomeBase,
      headline: z.string().includes("{p1}").includes("{p2}"),
    }),
    mixed_unmatched: z.strictObject({
      ...outcomeBase,
      distinctive_heading: z.string().min(1),
      overlap: z.string().includes("{pairs}"),
      overlap_pair: z.string().includes("{perspective}").includes("{topic}"),
      overlap_and: z.string().min(1),
      nearest_label: z.string().min(1),
      missing_link: z.string().min(1),
    }),
    undecided: z.strictObject({
      ...outcomeBase,
      coverage_body: z.string().min(1),
      /** Reason `middle`: every answer in the middle (scoring 0.3.0). */
      middle_headline: z.string().min(1),
      middle_body: z.string().min(1),
      lean_heading: z.string().min(1),
      lean_none: z.string().min(1),
      prompts_heading: z.string().min(1),
    }),
    indifferent: z.strictObject({ ...outcomeBase, section_heading: z.string().min(1), section_body: z.string().min(1) }),
  }),
  tensions: z.array(tensionSchema).min(1),
  no_tension: z.string().includes("{strongest_construct_name}"),
  // Templates come in _agree/_disagree pairs, picked by the direction of the answer.
  statements: z.strictObject({
    note: z.string().optional(),
    common_ground_with_closest_agree: z.string().includes("{short}"),
    common_ground_with_closest_disagree: z.string().includes("{short}"),
    unexpected_common_ground_agree: z.string().includes("{short}"),
    unexpected_common_ground_disagree: z.string().includes("{short}"),
    difference_with_closest_agree: z.string().includes("{short}"),
    difference_with_closest_disagree: z.string().includes("{short}"),
    friend_agree_agree: z.string().includes("{short}"),
    friend_agree_disagree: z.string().includes("{short}"),
    friend_disagree_prompt: z.string().includes("{short}"),
  }),
  why_this_result: z.string().min(1),
  /** Shown under the headline card on every outcome while results are provisional (scoring spec section 8). */
  provisional: z.string().min(1),
});

// ---------- base-rates.json ----------

export const baseRateSchema = z.strictObject({
  construct: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/),
  item: z.string().min(1).optional(),
  similar_question: z.boolean().optional(),
  text: z.string().min(1),
  value: z.number(),
  approximate: z.boolean(),
  source: z.string().min(1),
  year: z.number().int().min(1990).max(2100),
  population: z.string().min(1),
  ledger: z.string().min(1),
});

export const baseRatesFileSchema = z.strictObject({
  base_rates_version: version,
  rules: z.array(z.string().min(1)),
  last_checked: z.iso.date(),
  items: z.array(baseRateSchema).min(1),
});

export type Item = z.infer<typeof itemSchema>;
export type ItemFormat = z.infer<typeof itemFormatSchema>;
export type Form = z.infer<typeof formSchema>;
export type FormBlock = z.infer<typeof formBlockSchema>;
export type ItemsFile = z.infer<typeof itemsFileSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type BandId = z.infer<typeof bandIdSchema>;
export type Perspective = z.infer<typeof perspectiveSchema>;
export type PerspectivesFile = z.infer<typeof perspectivesFileSchema>;
export type Tension = z.infer<typeof tensionSchema>;
export type NarrativesFile = z.infer<typeof narrativesFileSchema>;
export type BaseRate = z.infer<typeof baseRateSchema>;
export type BaseRatesFile = z.infer<typeof baseRatesFileSchema>;

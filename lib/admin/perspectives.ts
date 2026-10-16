// The perspectives reference page (/admin/perspectives, issue #16): every
// perspective's full write-up, read straight from a content release so it can
// never go stale. Pure, so it can be tested without a server.
//
// Frozen releases are not re-parsed with today's schemas (lib/content/release.ts),
// so every field added after the first release is treated as optional here.
import type { Content, Perspective } from "@/lib/content";
import { contentVersions } from "@/lib/content";
import type { CopyFile } from "@/lib/content/copy";
import { versionsLine } from "@/lib/admin";
import { render } from "@/lib/results";
import { band } from "@/lib/scoring";

/**
 * The perspectives.json fields this page shows. A test fails when the content
 * gains a field that isn't listed here, so new wording can't go unseen.
 */
export const SHOWN_FILE_FIELDS = ["taxonomy_version", "status", "notes", "perspectives", "candidates_not_scored"] as const;
export const SHOWN_PERSPECTIVE_FIELDS = [
  "id",
  "name",
  "tagline",
  "card_summary",
  "description",
  "strongest_objection",
  "discussion_prompt",
  "elsewhere",
  "evidence_refs",
  "prototype",
  "weight",
  "signatures",
] as const;

/** Outcomes other than the perspectives, in the order the page lists them. Unknown outcomes follow, under their ID. */
const OUTCOMES: [string, string][] = [
  ["matched", "Closest perspective (the wording around any of them)"],
  ["mixed_between", "In between"],
  ["mixed_unmatched", "Your own combination"],
  ["undecided", "Still forming"],
  ["indifferent", "Not a priority"],
];

/** Labels for the outcome fields that need explaining. Other fields show their key. */
const FIELD_LABELS: Record<string, string> = {
  headline: "Headline",
  visitor_headline: "Headline for visitors (someone else's result)",
  subhead: "Subhead",
  body: "Body",
};
const UNDECIDED_LABELS: Record<string, string> = {
  body: "Body: unsure on several questions (confidence)",
  coverage_body: "Body: skipped too many questions (coverage)",
  middle_headline: "Headline: in the middle on every question (middle)",
  middle_visitor_headline: "Headline for visitors: in the middle on every question (middle)",
  middle_body: "Body: in the middle on every question (middle)",
};
/** narratives.json fields shown with an outcome although they sit at the top of the file. */
const OUTCOME_EXTRAS: Record<string, [string, string][]> = {
  matched: [["unsettled_note", "Note when unsure on several questions but leaning clearly"]],
};
/** Not user-facing: build notes, IDs and matching rules. Everything else in narratives.json is shown. */
const NOT_SHOWN = new Set(["narratives_version", "voice", "note", "id", "when", "evidence_refs"]);
/** Section titles for the rest of narratives.json. Unknown keys show their key. */
const WORDING_TITLES: Record<string, string> = {
  constructs: "The six questions",
  bands: "Band words",
  unmeasured: "Not enough answers on a question",
  tensions: "Tensions",
  no_tension: "When there's no tension",
  statements: "Common ground and differences",
  why_this_result: "Why this result",
  provisional: "Early version note",
};
/** Shown first, in this order; the rest follow in file order. */
const LEAD_FIELDS = ["headline", "visitor_headline", "subhead", "body", "coverage_body", "middle_headline", "middle_visitor_headline", "middle_body"];

export interface Source {
  ref: string;
  /** The source line from copy.json, or null if copy.json has none for this ref. */
  line: string | null;
}

export interface Position {
  construct: string;
  question: string;
  /** The band in words, as a result page says it. */
  band: string;
  /** How much the question counts for this perspective, in words. */
  weight: string;
  rawPrototype: number;
  rawWeight: number;
}

export interface PerspectiveEntry {
  id: string;
  name: string;
  tagline: string;
  /** The share image's one-line summary; null in releases before taxonomy 0.2.1. */
  cardSummary: string | null;
  description: string;
  strongestObjection: string | null;
  discussionPrompt: string | null;
  elsewhere: string | null;
  positions: Position[];
  signatures: { item: string; direction: "Agrees" | "Disagrees"; text: string }[];
  evidence: Source[];
  /**
   * Compared with the current content, when showing an older release: the
   * fields that differ, or "not current" when the current content has no such
   * perspective. Null on the current content.
   */
  changed: ("name" | "tagline" | "description")[] | "not current" | null;
}

export interface OutcomeEntry {
  id: string;
  label: string;
  fields: { key: string; label: string; text: string }[];
  /** Source lines for figures the body quotes. On Still forming, these belong to the confidence body. */
  sources: Source[];
}

export interface WordingSection {
  id: string;
  title: string;
  items: { key: string; text: string }[];
}

export interface PerspectivesReference {
  versions: string;
  taxonomy: string;
  narratives: string;
  status: string;
  notes: string;
  perspectives: PerspectiveEntry[];
  outcomes: OutcomeEntry[];
  /** Everything else in narratives.json the site shows, so no wording goes unseen. */
  wording: WordingSection[];
  candidates: { id: string; name: string; note: string }[];
}

/** How much a question counts for a perspective, in words. */
export function weightWords(w: number): string {
  if (w <= 0) return "not part of it";
  if (w <= 0.5) return "minor";
  if (w <= 1) return "part of it";
  if (w < 2) return "important";
  return "defining";
}

function source(copy: CopyFile, ref: string): Source {
  const src = copy.evidence_sources?.sources[ref];
  return {
    ref,
    line: src ? render(copy.results.source_line, { source: src.source, year: src.year, population: src.population }) : null,
  };
}

/**
 * The page data for one content release. `copy` supplies the source lines
 * (a release's own, for older content). `current`, when given, is the live
 * content to mark changed perspectives against.
 */
export function buildPerspectivesReference(c: Content, copy: CopyFile, current?: Content): PerspectivesReference {
  const n = c.narratives;
  const file = c.perspectives as Partial<Content["perspectives"]> & Pick<Content["perspectives"], "perspectives">;
  const constructs = c.config.scored_constructs;
  const now = current && new Map(current.perspectives.perspectives.map((p) => [p.id, p]));

  const perspectives = file.perspectives.map((raw): PerspectiveEntry => {
    const p = raw as Partial<Perspective> & Pick<Perspective, "id" | "name" | "tagline" | "description" | "prototype" | "weight" | "signatures">;
    let changed: PerspectiveEntry["changed"] = null;
    if (now) {
      const cur = now.get(p.id);
      changed = cur ? (["name", "tagline", "description"] as const).filter((k) => cur[k] !== p[k]) : "not current";
    }
    return {
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      cardSummary: p.card_summary ?? null,
      description: p.description,
      strongestObjection: p.strongest_objection ?? null,
      discussionPrompt: p.discussion_prompt ?? null,
      elsewhere: p.elsewhere ?? null,
      positions: constructs.map((k) => {
        const meta = n.constructs[k];
        const proto = p.prototype[k] ?? 0;
        const w = p.weight[k] ?? 0;
        return {
          construct: k,
          question: meta.question,
          band: render(n.bands[band(proto, c.config.bands)], meta),
          weight: weightWords(w),
          rawPrototype: proto,
          rawWeight: w,
        };
      }),
      signatures: p.signatures.map((s) => {
        const item = c.itemsById.get(s.item);
        return { item: s.item, direction: s.direction === "agree" ? "Agrees" : "Disagrees", text: item?.stem ?? "(statement not found)" };
      }),
      evidence: (p.evidence_refs ?? []).map((ref) => source(copy, ref)),
      changed,
    };
  });

  const narr = n as unknown as Record<string, unknown>;
  const outcomesFile = n.outcomes as unknown as Record<string, Record<string, unknown>>;
  const known = OUTCOMES.filter(([id]) => id in outcomesFile);
  const extra = Object.keys(outcomesFile)
    .filter((id) => !OUTCOMES.some(([k]) => k === id))
    .map((id): [string, string] => [id, id]);
  const outcomes = [...known, ...extra].map(([id, label]): OutcomeEntry => {
    const o = outcomesFile[id];
    const keys = Object.keys(o).filter((k) => typeof o[k] === "string");
    const ordered = [...LEAD_FIELDS.filter((k) => keys.includes(k)), ...keys.filter((k) => !LEAD_FIELDS.includes(k))];
    const labels = id === "undecided" ? { ...FIELD_LABELS, ...UNDECIDED_LABELS } : FIELD_LABELS;
    const refs = Array.isArray(o.evidence_refs) ? (o.evidence_refs as string[]) : [];
    const extras = (OUTCOME_EXTRAS[id] ?? []).filter(([k]) => typeof narr[k] === "string");
    return {
      id,
      label,
      fields: [
        ...ordered.map((k) => ({ key: k, label: labels[k] ?? k, text: o[k] as string })),
        ...extras.map(([k, l]) => ({ key: k, label: l, text: narr[k] as string })),
      ],
      sources: refs.map((ref) => source(copy, ref)),
    };
  });

  const placed = new Set(["outcomes", ...Object.values(OUTCOME_EXTRAS).flatMap((x) => x.map(([k]) => k))]);
  const wording = Object.keys(narr)
    .filter((k) => !placed.has(k) && !NOT_SHOWN.has(k))
    .map((k): WordingSection => ({ id: k, title: WORDING_TITLES[k] ?? k, items: strings(narr[k], "") }))
    .filter((w) => w.items.length > 0);

  const v = contentVersions(c);
  return {
    versions: versionsLine(v),
    taxonomy: v.taxonomy,
    narratives: v.narratives,
    status: file.status ?? "",
    notes: file.notes ?? "",
    perspectives,
    outcomes,
    wording,
    candidates: (file.candidates_not_scored ?? []).map((x) => ({ id: x.id, name: x.name, note: x.note })),
  };
}

/** Every string under `v`, keyed by its path; list entries by their `id` where they have one. */
function strings(v: unknown, path: string): { key: string; text: string }[] {
  if (typeof v === "string") return [{ key: path, text: v }];
  if (Array.isArray(v)) {
    return v.flatMap((x, i) => {
      const id = x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" ? (x as { id: string }).id : String(i + 1);
      return strings(x, path ? `${path} · ${id}` : id);
    });
  }
  if (v && typeof v === "object") {
    return Object.entries(v)
      .filter(([k]) => !NOT_SHOWN.has(k))
      .flatMap(([k, x]) => strings(x, path ? `${path} · ${k}` : k));
  }
  return [];
}

/** The newest /changes entry: version and date (or "not dated yet"). */
export function newestChange(copy: CopyFile): string {
  const e = copy.changelog.entries[0];
  if (!e) return "none yet";
  return `${e.version} · ${e.date ?? "not dated yet"}`;
}

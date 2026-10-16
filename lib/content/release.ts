// Frozen content releases (lib/content/releases, made by `npm run
// content:freeze`). A stored result is always rendered with the release it was
// scored under, so its statements, perspectives and wording are the ones the
// person saw (CLAUDE.md non-negotiable 4).
//
// A release was valid under the content schemas of its own time, and today's
// schemas may require fields it never had, so frozen files are not re-parsed
// with them. Rendering code treats fields added later as optional.
import type { Content, Item, Versions } from "@/lib/content";
import { getCopy, type CopyFile } from "@/lib/content/copy";

export interface RawRelease {
  items: unknown;
  config: unknown;
  perspectives: unknown;
  narratives: unknown;
  baseRates: unknown;
  /** Only `countries` and `evidence_sources` from copy.json. */
  copy: unknown;
}

export interface Release {
  key: string;
  content: Content;
  /**
   * Today's copy with the release's country names and evidence source lines,
   * the parts of copy.json a result's meaning depends on. Labels and buttons
   * stay current.
   */
  copy: CopyFile;
}

export function releaseKey(v: Versions): string {
  return `${v.scoring}-${v.taxonomy}-${v.item_bank}-${v.narratives}`;
}

/** Build a release from frozen files. Exported for tests. */
export function fromRaw(key: string, raw: RawRelease, current: CopyFile = getCopy()): Release {
  const items = raw.items as Content["items"];
  const itemsById = new Map<string, Item>(items.items.map((i) => [i.id, i]));
  const content: Content = {
    items,
    itemsById,
    config: raw.config as Content["config"],
    perspectives: raw.perspectives as Content["perspectives"],
    narratives: raw.narratives as Content["narratives"],
    baseRates: raw.baseRates as Content["baseRates"],
  };
  const old = raw.copy as Pick<CopyFile, "countries" | "evidence_sources">;
  const copy: CopyFile = { ...current, countries: old.countries, evidence_sources: old.evidence_sources };
  return { key, content, copy };
}

const built = new Map<string, Release>();

/** The release for a stored result's versions, or null if it was never frozen. */
export async function loadRelease(v: Versions): Promise<Release | null> {
  return loadReleaseByKey(releaseKey(v));
}

/** Every frozen release key, sorted by key. */
export async function releaseKeys(): Promise<string[]> {
  const { releases } = await import("./releases");
  return Object.keys(releases);
}

/** A frozen release by its key, or null if there is none. */
export async function loadReleaseByKey(key: string): Promise<Release | null> {
  if (!built.has(key)) {
    const { releases } = await import("./releases");
    // The key can come from a URL: only the releases' own keys count, and
    // unknown keys are not cached.
    if (!Object.hasOwn(releases, key)) return null;
    built.set(key, fromRaw(key, releases[key]));
  }
  return built.get(key)!;
}

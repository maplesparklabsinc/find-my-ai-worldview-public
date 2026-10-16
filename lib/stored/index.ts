// Turning a stored response into what the result and compare pages show.
// Server only (it reads the database).
import "server-only";
import { cache } from "react";
import { contentVersions, getContent, type Versions } from "@/lib/content";
import { loadRelease, releaseKey, type Release } from "@/lib/content/release";
import { getResponse, type StoredResponse } from "@/lib/db";
import { compareView, headlineFor, resultView, type CompareView, type ResultView } from "@/lib/results";
import { compare, type ScoreResult } from "@/lib/scoring";
import { responseIdSchema } from "@/lib/submit";

/** One read per request, shared by the page, its metadata and its share image. */
export const loadResponse = cache(async (id: string): Promise<StoredResponse | null> => {
  if (!responseIdSchema.safeParse(id).success) return null;
  return getResponse(id);
});

export interface Shown {
  row: StoredResponse;
  result: ScoreResult;
  /** The content release the result was scored under; null if it was never frozen. */
  release: Release | null;
  /** The full result in its own release's wording; null when the release is missing. */
  view: ResultView | null;
  /** Always available, even without the release. */
  headline: string;
  /** Scored under an earlier version than the site runs now: show the banner. */
  outdated: boolean;
}

export function versionsOf(row: StoredResponse): Versions {
  return {
    scoring: row.scoring_version,
    taxonomy: row.taxonomy_version,
    item_bank: row.item_bank_version,
    narratives: row.narratives_version,
  };
}

/**
 * The stored result, rendered with the release it was scored under (CLAUDE.md
 * non-negotiable 4). Never re-scored: if the release is missing, or cannot be
 * rendered, only the stored headline is shown with a plain note.
 */
export async function shown(row: StoredResponse): Promise<Shown> {
  const versions = versionsOf(row);
  const outdated = releaseKey(versions) !== releaseKey(contentVersions(getContent()));
  const release = await loadRelease(versions);
  // Today's outcome templates with the perspective names stored at the time.
  const o = row.result.outcome;
  const fallback = headlineFor(getContent(), o.type, o.ranked, o.type === "undecided" ? o.reason : null);
  const bare = { row, result: row.result, release, view: null, headline: fallback.headline, outdated: true };
  if (!release) return bare;
  try {
    const view = resultView(release.content, release.copy, row.result, row.answers);
    return { row, result: row.result, release, view, headline: view.headline, outdated };
  } catch (e) {
    console.error(`result ${row.id} does not render under release ${release.key}`, e);
    return bare;
  }
}

/** The friend comparison: `you` is the person reading, `them` the other response. Null if either cannot be shown. */
export function comparison(you: Shown, them: Shown): CompareView | null {
  if (!you.release || !you.view || !them.view) return null;
  const c = you.release.content;
  try {
    return compareView(c, compare(c, you.row.answers, them.row.answers), you.result, them.result);
  } catch {
    // The two were scored under releases with different questions; show each result on its own.
    return null;
  }
}

// Which responses an admin card counts as "current" (issue #89). Pure.
//
// The scoring and taxonomy versions decide a result; the item bank and
// narratives versions change wording. So the Overview counts every response
// made under the live result rules, and Research checks, where statement
// wording matters, count only the exact live release.
import type { Versions } from "@/lib/content";

/** "rules": the live scoring and taxonomy versions, any wording. "release": all four versions, exactly. */
export type Scope = "rules" | "release";

/** The versions a response must have to count under this scope. */
export function scopeVersions(live: Versions, scope: Scope): Partial<Versions> {
  return scope === "rules" ? { scoring: live.scoring, taxonomy: live.taxonomy } : { ...live };
}

/** Whether a response saved under `v` counts as current under this scope. */
export function inScope(v: Versions, live: Versions, scope: Scope): boolean {
  return Object.entries(scopeVersions(live, scope)).every(([k, want]) => v[k as keyof Versions] === want);
}

/** "scoring 0.4.0, taxonomy 0.3.1", for the cards' notes. */
export function rulesLine(live: Versions): string {
  return `scoring ${live.scoring}, taxonomy ${live.taxonomy}`;
}

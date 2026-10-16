// Short site copy (content/copy.json) and placeholder filling. Safe in the browser.
import copyJson from "@/content/copy.json";
import itemsJson from "@/content/items.json";
import { copyFileSchema, type CopyFile } from "./copy-schema";

export * from "./copy-schema";

const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;

export function parseCopy(raw: unknown, d11Options: string[]): CopyFile {
  const copy = copyFileSchema.parse(raw);
  const problems: string[] = [];
  for (const c of copy.countries) {
    if (!d11Options.includes(c.d11_option)) problems.push(`country ${c.code}: "${c.d11_option}" is not a D11 option`);
  }
  const ids = copy.feedback.problem_options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) problems.push("duplicate feedback problem ids");
  if (problems.length) throw new Error(`copy.json failed cross-checks:\n- ${problems.join("\n- ")}`);
  return { ...copy, placeholders: resolvePlaceholders(copy.placeholders) };
}

/**
 * Placeholders can use other placeholders (issue #43: the scoring rules and
 * sources links are built from {public_repo_url}). Fill them from each other;
 * a reference to an unset one stays visible, and only the unset one is missing.
 */
export function resolvePlaceholders(placeholders: CopyFile["placeholders"]): CopyFile["placeholders"] {
  const resolve = (name: string, seen: string[]): string | null => {
    if (seen.includes(name)) throw new Error(`copy.json placeholders refer to each other in a loop: ${[...seen, name].join(" -> ")}`);
    const v = placeholders[name];
    return v == null ? v : v.replace(PLACEHOLDER, (whole, ref: string) => (ref in placeholders && resolve(ref, [...seen, name])) || whole);
  };
  return Object.fromEntries(Object.keys(placeholders).map((k) => [k, resolve(k, [])]));
}

let cached: CopyFile | null = null;

export function getCopy(): CopyFile {
  const d11 = itemsJson.items.find((i) => i.id === "D11")?.options ?? [];
  cached ??= parseCopy(copyJson, d11);
  return cached;
}

/**
 * Fill {name} placeholders from `values`, then from copy.placeholders. Unknown or
 * unset names are left as written so they stay visible rather than vanish.
 */
export function fill(text: string, values: Record<string, string | number> = {}, copy: CopyFile = getCopy()): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    if (name in values) return String(values[name]);
    return copy.placeholders[name] ?? whole;
  });
}

/** Site-wide placeholders that are still unset. All must be set before launch. */
export function missingPlaceholders(copy: CopyFile = getCopy()): string[] {
  return Object.entries(copy.placeholders)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
}

/** Placeholder names used in a piece of text. */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]);
}


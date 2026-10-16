// Long-form pages (content/pages/*.md). Server only: read from disk at build or request time.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fill } from "./copy";

export const PAGES = ["how-it-works", "privacy"] as const;
export type PageName = (typeof PAGES)[number];

/** Raw markdown for a page, with site placeholders filled where set. */
export function getPage(name: PageName): string {
  const raw = readFileSync(join(process.cwd(), "content", "pages", `${name}.md`), "utf8");
  return fill(raw);
}

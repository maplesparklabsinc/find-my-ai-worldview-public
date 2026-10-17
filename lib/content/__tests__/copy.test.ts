import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import copyJson from "@/content/copy.json";
import itemsJson from "@/content/items.json";
import { fill, getCopy, missingPlaceholders, parseCopy, placeholdersIn, resolvePlaceholders } from "@/lib/content/copy";
import { getPage, PAGES } from "@/lib/content/pages";

const copy = getCopy();
const D11 = itemsJson.items.find((i) => i.id === "D11")!.options;
const ROUTES = ["/", "/start", "/quiz", "/how-it-works", "/privacy", "/changes", "/feedback"];

function allStrings(x: unknown): string[] {
  if (typeof x === "string") return [x];
  if (Array.isArray(x)) return x.flatMap(allStrings);
  if (x && typeof x === "object") return Object.values(x).flatMap(allStrings);
  return [];
}
const raw = (name: string) => readFileSync(`content/pages/${name}.md`, "utf8");
const texts = [...allStrings({ ...copyJson, note: "" }), ...PAGES.map(raw)];

describe("site copy", () => {
  it("parses and maps every country to a D11 option", () => {
    expect(copy.countries.map((x) => x.code)).toEqual(["CA", "US", "GB", "AU"]);
    expect(() => parseCopy(copyJson, ["Canada"])).toThrow(/not a D11 option/);
  });

  it("only uses known site placeholders", () => {
    const known = new Set([...Object.keys(copy.placeholders), "n", "total", "which", "version", "date", "perspective", "source", "year", "population", "country", "site", "p1", "p2", "feedback_link", "name", "you", "them", "question", "you_label", "them_label", "title", "end"]);
    for (const t of texts) for (const p of placeholdersIn(t)) expect(known).toContain(p);
  });

  it("links only to pages the site has", () => {
    for (const t of texts) {
      for (const m of t.matchAll(/\]\(([^)]+)\)/g)) {
        const href = m[1];
        if (href.startsWith("{")) continue; // a placeholder URL
        expect(ROUTES).toContain(href);
      }
    }
  });

  it("follows the voice rules: no em dashes", () => {
    for (const t of texts) expect(t).not.toContain("—");
  });

  it("fills placeholders that are set and leaves unset ones visible", () => {
    const withEmail = { ...copy, placeholders: { ...copy.placeholders, contact_email: "hello@example.org" } };
    expect(fill("Email {contact_email}.", {}, withEmail)).toBe("Email hello@example.org.");
    expect(fill("{n} people", { n: 600 })).toBe("600 people");
    if (copy.placeholders.contact_email === null) expect(fill("Email {contact_email}.")).toBe("Email {contact_email}.");
  });

  it("lists what must be set before launch", () => {
    expect(missingPlaceholders().sort()).toEqual(
      Object.entries(copy.placeholders).filter(([, v]) => v === null).map(([k]) => k).sort(),
    );
  });

  // Issue #43: the How this works links point into the public snapshot repo.
  it("builds the scoring rules and sources links from public_repo_url", () => {
    const withRepo = parseCopy({ ...copyJson, placeholders: { ...copyJson.placeholders, public_repo_url: "https://github.com/org/repo" } }, D11);
    expect(withRepo.placeholders.scoring_rules_url).toBe("https://github.com/org/repo/blob/main/docs/02-scoring-spec.md");
    expect(withRepo.placeholders.sources_url).toBe("https://github.com/org/repo/blob/main/research/evidence-ledger.csv");
    expect(missingPlaceholders(withRepo)).not.toContain("public_repo_url");
    expect(fill("[the scoring rules]({scoring_rules_url})", {}, withRepo)).toBe("[the scoring rules](https://github.com/org/repo/blob/main/docs/02-scoring-spec.md)");
  });

  it("leaves the links visibly unset, and launch-check failing, until public_repo_url is set", () => {
    const unset = parseCopy({ ...copyJson, placeholders: { ...copyJson.placeholders, public_repo_url: null } }, D11);
    expect(missingPlaceholders(unset)).toContain("public_repo_url");
    expect(missingPlaceholders(unset)).not.toContain("scoring_rules_url");
    expect(unset.placeholders.scoring_rules_url).toBe("{public_repo_url}/blob/main/docs/02-scoring-spec.md");
  });

  it("refuses placeholders that refer to each other in a loop", () => {
    expect(() => resolvePlaceholders({ a: "{b}/x", b: "{a}/y" })).toThrow(/loop/);
  });

  // Issue #46: a way to get in touch, from the contact_email placeholder.
  it("ends How this works with Get in touch, the real address and a Tell us link", () => {
    const page = getPage("how-it-works");
    const last = page.slice(page.lastIndexOf("### ")).trim();
    expect(last).toMatch(/^### Get in touch\n/);
    expect(last).toContain(`Email ${copy.placeholders.contact_email}.`);
    expect(last).toContain("[Tell us](/feedback)");
    expect(last).not.toMatch(/[{}]/);
  });

  it("loads the long pages", () => {
    expect(getPage("how-it-works")).toMatch(/^### What this is/);
    expect(getPage("privacy")).toMatch(/^### Privacy/);
  });
});

describe("evidence sources", () => {
  it("cover every evidence reference in the outcome copy and exist in the ledger", async () => {
    const { getContent } = await import("@/lib/content");
    const ledger = new Set(
      readFileSync("research/evidence-ledger.csv", "utf8")
        .split("\n")
        .slice(1)
        .map((l) => l.split(",")[0]),
    );
    const refs = Object.values(getContent().narratives.outcomes).flatMap((o) => ("evidence_refs" in o ? (o.evidence_refs ?? []) : []));
    for (const r of refs) expect(Object.keys(copy.evidence_sources.sources)).toContain(r);
    for (const k of Object.keys(copy.evidence_sources.sources)) expect(ledger).toContain(k);
  });
});

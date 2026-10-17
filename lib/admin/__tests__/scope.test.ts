// Issue #89: which responses the admin cards count as "current".
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inScope, rulesLine, scopeVersions } from "@/lib/admin/scope";
import type { Versions } from "@/lib/content";

const live: Versions = { scoring: "0.4.0", taxonomy: "0.3.1", item_bank: "0.9.0", narratives: "0.7.0" };
const saved = (change: Partial<Versions>): Versions => ({ ...live, ...change });

describe("the version match", () => {
  it("same result rules and wording: current under both scopes", () => {
    expect(inScope(live, live, "rules")).toBe(true);
    expect(inScope(live, live, "release")).toBe(true);
  });

  it("a different item bank (0.8.0 under 0.9.0): current for the Overview, not for Research checks", () => {
    expect(inScope(saved({ item_bank: "0.8.0" }), live, "rules")).toBe(true);
    expect(inScope(saved({ item_bank: "0.8.0" }), live, "release")).toBe(false);
  });

  it("different narratives: current for the Overview, not for Research checks", () => {
    expect(inScope(saved({ narratives: "0.6.0" }), live, "rules")).toBe(true);
    expect(inScope(saved({ narratives: "0.6.0" }), live, "release")).toBe(false);
  });

  it("a different scoring or taxonomy version: never current", () => {
    for (const change of [{ scoring: "0.3.0" }, { taxonomy: "0.3.0" }, { scoring: "0.3.0", item_bank: "0.8.0" }]) {
      expect(inScope(saved(change), live, "rules"), JSON.stringify(change)).toBe(false);
      expect(inScope(saved(change), live, "release"), JSON.stringify(change)).toBe(false);
    }
  });

  it("filters on scoring and taxonomy for rules, all four for release; the notes name the rules", () => {
    expect(scopeVersions(live, "rules")).toEqual({ scoring: "0.4.0", taxonomy: "0.3.1" });
    expect(scopeVersions(live, "release")).toEqual(live);
    expect(rulesLine(live)).toBe("scoring 0.4.0, taxonomy 0.3.1");
  });

  it("the Overview reads by the result rules; Research checks keep the exact release", () => {
    const overview = readFileSync("app/admin/page.tsx", "utf8");
    expect(overview).toContain('readAdmin(versions, "rules")');
    expect(overview).toContain('readAdminRows(versions, "rules")');
    const research = readFileSync("app/admin/research/page.tsx", "utf8");
    expect(research).toContain("Promise.all([readAdmin(versions), readAdminRows(versions)])");
    // The database filter is built from scopeVersions, so these tests cover it.
    expect(readFileSync("lib/db/admin.ts", "utf8")).toContain("scopeVersions(live, scope)");
  });
});

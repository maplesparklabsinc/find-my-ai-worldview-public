// Issue #51: admin queries never read an email column. research_contacts is read
// for created_on and withdrawn only; feedback.email only as "is it set".
// Issue #55: that includes the export (readExport), which lives in the same file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("lib/db/admin.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("lib/db/admin.ts", () => {
  it("only ever uses an email column as 'is not null'", () => {
    const uses = [...src.matchAll(/\b(?:\w+\.)?email\b(?!\s+is not null)/g)].map((m) => m[0]);
    expect(uses).toEqual([]);
    expect(src).toMatch(/email is not null/);
  });

  it("covers the export query", () => {
    const exportQuery = src.slice(src.indexOf("export async function readExport"));
    expect(exportQuery.length).toBeGreaterThan(100);
    expect([...exportQuery.matchAll(/\bemail\b(?!\s+is not null)/g)]).toEqual([]);
  });

  it("never selects everything from research_contacts or feedback", () => {
    expect(src).not.toMatch(/\*\s+from\s+(research_contacts|feedback)\b/i);
    expect(src).not.toMatch(/\b(rc|f)\.\*/);
    expect(src).not.toMatch(/to_jsonb\(\s*(rc|f|research_contacts|feedback)\s*\)/i);
  });

  // PR #65 review: the Research checks tab reads only what the dashboard reads.
  it("covers /admin/research: it reads the database only through readAdmin and readAdminRows", () => {
    const page = readFileSync("app/admin/research/page.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(page).toMatch(/import \{ readAdmin, readAdminRows \} from "@\/lib\/db\/admin";/);
    expect(page).not.toMatch(/@\/lib\/db["/](?!admin)|from "postgres"|\bemail\b/);
  });
});

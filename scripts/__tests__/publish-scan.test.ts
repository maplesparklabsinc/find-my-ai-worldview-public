// The publish scan (issue #43) on a fixture folder. The planted values are
// built from pieces so this file itself passes the scan in the public snapshot.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { scanFolder } from "@/scripts/publish-scan.mjs";

const at = "@";
const dir = mkdtempSync(join(tmpdir(), "publish-scan-"));
mkdirSync(join(dir, "docs"));
writeFileSync(join(dir, "docs/notes.md"), ["# Notes", `Write to someone${at}gmail.com about it.`, "Nothing here."].join("\n"));
writeFileSync(join(dir, "docs/links.md"), ["See https://claude.ai/code/" + "session_01ABC for the run.", "fine"].join("\n"));
writeFileSync(join(dir, "env.txt"), "DATABASE_URL=postgres" + "://user:pw" + at + "db.internal:5432/postgres\n");
writeFileSync(join(dir, "contact.md"), `Email findmyaiworldview${at}maplesparklabs.com or test with a${at}example.com.\n`);
writeFileSync(join(dir, "image.png"), Buffer.from([0x89, 0x50, 0x00, ...Buffer.from(`x${at}gmail.com`)]));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("publish scan", () => {
  const findings = scanFolder(dir);

  it("finds a planted email, a session link and a connection string, with file and line", () => {
    expect(findings).toContainEqual({ file: "docs/notes.md", line: 2, kind: "email address" });
    expect(findings).toContainEqual({ file: "docs/links.md", line: 1, kind: "private session link" });
    expect(findings).toContainEqual({ file: "env.txt", line: 1, kind: "Postgres connection string" });
  });

  it("allows the contact address and reserved example domains, and skips binary files", () => {
    expect(findings.filter((f) => f.file === "contact.md" || f.file === "image.png")).toEqual([]);
  });

  it("never reports the matched text", () => {
    expect(JSON.stringify(findings)).not.toContain("gmail");
    expect(JSON.stringify(findings)).not.toContain("session_");
  });
});

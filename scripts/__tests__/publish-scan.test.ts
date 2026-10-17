// The publish scan (issue #43) on a fixture folder. The planted values are
// built from pieces so this file itself passes the scan in the public snapshot.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { missingReadmeFiles, opsWarnings, scanFolder } from "@/scripts/publish-scan.mjs";

const at = "@";
const dir = mkdtempSync(join(tmpdir(), "publish-scan-"));
mkdirSync(join(dir, "docs"));
writeFileSync(join(dir, "docs/notes.md"), ["# Notes", `Write to someone${at}gmail.com about it.`, "Nothing here."].join("\n"));
writeFileSync(join(dir, "docs/links.md"), ["See https://claude.ai/code/" + "session_01ABC for the run.", "fine"].join("\n"));
writeFileSync(join(dir, "env.txt"), "DATABASE_URL=postgres" + "://user:pw" + at + "db.internal:5432/postgres\n");
writeFileSync(
  join(dir, "local.md"),
  ["postgres" + "://fmaw:local" + at + "127.0.0.1:54329/fmaw_dev", "postgresql" + "://fmaw:local" + at + "localhost:54329/fmaw_test"].join("\n"),
);
writeFileSync(join(dir, "pooler.md"), `Use postgresql${"://"}postgres.abc:pw${at}aws-1-ca-central-1.pooler.${"supa"}base.com:5432/postgres\n`);
writeFileSync(join(dir, "contact.md"), `Email findmyaiworldview${at}maplesparklabs.com or test with a${at}example.com.\n`);
writeFileSync(
  join(dir, "template.env"),
  `DATABASE_URL=postgresql${"://"}<user>:<password>${at}ep-<name>-pooler.<region>.aws.neon.tech/neondb?sslmode=require\n`,
);
writeFileSync(join(dir, "image.png"), Buffer.from([0x89, 0x50, 0x00, ...Buffer.from(`x${at}gmail.com`)]));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("publish scan", () => {
  const findings = scanFolder(dir);

  it("finds a planted email, a session link and a connection string, with file and line", () => {
    expect(findings).toContainEqual({ file: "docs/notes.md", line: 2, kind: "email address" });
    expect(findings).toContainEqual({ file: "docs/links.md", line: 1, kind: "private session link" });
    expect(findings).toContainEqual({ file: "env.txt", line: 1, kind: "Postgres connection string" });
  });

  it("allows a local Docker database URL and still finds a Supabase pooler URL", () => {
    expect(findings.filter((f) => f.file === "local.md")).toEqual([]);
    expect(findings).toContainEqual({ file: "pooler.md", line: 1, kind: "Postgres connection string" });
  });

  it("allows a template's placeholder connection string", () => {
    expect(findings.filter((f) => f.file === "template.env")).toEqual([]);
  });

  it("allows the contact address and reserved example domains, and skips binary files", () => {
    expect(findings.filter((f) => f.file === "contact.md" || f.file === "image.png")).toEqual([]);
  });

  it("never reports the matched text", () => {
    expect(JSON.stringify(findings)).not.toContain("gmail");
    expect(JSON.stringify(findings)).not.toContain("session_");
  });
});

describe("files the README names", () => {
  const snap = mkdtempSync(join(tmpdir(), "publish-readme-"));
  mkdirSync(join(snap, "docs"));
  writeFileSync(join(snap, ".env.example"), "DATABASE_URL=\n");
  writeFileSync(join(snap, "docs/decisions.md"), "\n");
  writeFileSync(
    join(snap, "README.md"),
    [
      "Copy `.env.example` to `.env.local`, then run `npm run dev` at `127.0.0.1:3000` and open `/admin`.",
      "See `docs/decisions.md`, `docs/05-design-notes.md` and `LICENSE`.",
    ].join("\n"),
  );
  afterAll(() => rmSync(snap, { recursive: true, force: true }));

  it("lists only the named files that are missing", () => {
    expect(missingReadmeFiles(snap)).toEqual([
      { line: 2, name: "docs/05-design-notes.md" },
      { line: 2, name: "LICENSE" },
    ]);
  });
});

describe("operations words", () => {
  const ops = mkdtempSync(join(tmpdir(), "publish-ops-"));
  writeFileSync(join(ops, "notes.md"), ["The admin page has no lockout.", "We're on the free plan.", "Nothing to see."].join("\n"));
  writeFileSync(join(ops, "LICENSE"), "INCIDENTAL DAMAGES and backups\n");
  afterAll(() => rmSync(ops, { recursive: true, force: true }));

  it("warns with file, line and kind, and skips licence texts", () => {
    expect(opsWarnings(ops)).toEqual([
      { file: "notes.md", line: 1, kind: "lockout" },
      { file: "notes.md", line: 2, kind: "hosting plan" },
    ]);
  });
});

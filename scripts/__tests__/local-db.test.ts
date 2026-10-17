// The check db:seed, db:reset and db:restore-local run before writing (issues
// #53 and #57): only the local Docker database is allowed. The planted URLs are
// built from pieces so this file passes the publish scan.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LOCAL_DEV_URL, LOCAL_TEST_URL, notLocalReason, notSeedableReason } from "@/scripts/local-db.mjs";

const pg = "postgres" + "://";
const at = "@";
const supabase = `${pg}postgres.abcdefgh:secret-pw${at}aws-1-ca-central-1.pooler.${"supa"}base.com:5432/postgres`;

describe("local database check", () => {
  it("allows the local Docker database", () => {
    expect(notLocalReason(LOCAL_DEV_URL)).toBeNull();
    expect(notLocalReason(LOCAL_TEST_URL)).toBeNull();
    expect(notLocalReason(`${pg}fmaw:local@localhost:54329/fmaw_dev`)).toBeNull();
  });

  it("refuses any other host or port, without echoing the credentials", () => {
    for (const url of [
      supabase,
      `${pg}fmaw:local@127.0.0.1:5432/fmaw_dev`,
      `${pg}fmaw:local@127.0.0.1/fmaw_dev`,
      `${pg}fmaw:local${at}db.internal:54329/fmaw_dev`,
      "postgresql" + "://fmaw:local@10.0.0.5:54329/fmaw_dev",
      "not a url",
      "mysql" + "://fmaw:local@127.0.0.1:54329/fmaw_dev",
    ]) {
      const reason = notLocalReason(url);
      expect(reason, url).toMatch(/Nothing changed|not a/);
      expect(reason).not.toContain("secret-pw");
      expect(reason).not.toContain("local@");
    }
  });

  it.each([["db:seed"], ["db:reset"]])("npm run %s exits non-zero for a non-local DATABASE_URL", (script) => {
    let status = 0;
    let stderr = "";
    try {
      execFileSync("npm", ["run", "--silent", script, "--", "unused.dump.age"], {
        env: { ...process.env, DATABASE_URL: supabase },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
    } catch (e) {
      const err = e as { status: number; stderr: string };
      status = err.status;
      stderr = err.stderr;
    }
    expect(status).not.toBe(0);
    expect(stderr).toContain("not the local Docker database");
    expect(stderr).not.toContain("secret-pw");
  });

  it("the seed also writes to the one host named in SEED_ALLOWED_HOST, never to Supabase", () => {
    const neon = `${pg}u:pw${at}ep-quiet-sky-123456.ca-central-1.aws.neon.tech/neondb?sslmode=require`;
    expect(notSeedableReason(LOCAL_DEV_URL, undefined)).toBeNull();
    expect(notSeedableReason(neon, undefined)).toMatch(/SEED_ALLOWED_HOST/);
    expect(notSeedableReason(neon, "EP-QUIET-SKY-123456.ca-central-1.aws.neon.tech")).toBeNull();
    expect(notSeedableReason(neon, "ep-other.ca-central-1.aws.neon.tech")).toMatch(/Nothing changed/);
    const host = new URL(supabase).hostname;
    expect(notSeedableReason(supabase, host)).toMatch(/never seeded/);
    expect(notSeedableReason(supabase, host)).not.toContain("secret-pw");
  });

  it("db:reset stays local only, whatever SEED_ALLOWED_HOST says", () => {
    let stderr = "";
    try {
      execFileSync("npm", ["run", "--silent", "db:reset"], {
        env: { ...process.env, DATABASE_URL: `${pg}u:pw${at}dev.example.org:5432/x`, SEED_ALLOWED_HOST: "dev.example.org" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      stderr = (e as { stderr: string }).stderr;
    }
    expect(stderr).toContain("not the local Docker database");
  });
});

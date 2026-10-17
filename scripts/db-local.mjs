// Helpers for the local Docker database (issue #53).
//
//   node scripts/db-local.mjs migrate   # run the migrations on fmaw_dev and fmaw_test (npm run db:up)
//   node scripts/db-local.mjs reset     # drop and recreate both, migrate, seed fmaw_dev (npm run db:reset)
//
// Both act only on the local database; reset refuses to run if DATABASE_URL
// points anywhere else.
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { LOCAL_ADMIN_URL, LOCAL_DEV_URL, LOCAL_TEST_URL, databaseUrl, requireLocal } from "./local-db.mjs";

const root = new URL("..", import.meta.url).pathname;
const command = process.argv[2];

function migrate(url) {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { cwd: root, stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

if (command === "migrate") {
  migrate(LOCAL_DEV_URL);
  migrate(LOCAL_TEST_URL);
} else if (command === "reset") {
  requireLocal(databaseUrl(root));
  execFileSync("docker", ["compose", "up", "-d", "--wait"], { cwd: root, stdio: "inherit" });
  const sql = postgres(LOCAL_ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    for (const name of ["fmaw_dev", "fmaw_test"]) {
      await sql.unsafe(`drop database if exists ${name} with (force)`);
      await sql.unsafe(`create database ${name}`);
      console.log(`Recreated ${name}.`);
    }
  } finally {
    await sql.end();
  }
  migrate(LOCAL_DEV_URL);
  migrate(LOCAL_TEST_URL);
  execFileSync("npm", ["run", "--silent", "db:seed"], { cwd: root, stdio: "inherit", env: { ...process.env, DATABASE_URL: LOCAL_DEV_URL } });
} else {
  console.error("Usage: node scripts/db-local.mjs migrate|reset");
  process.exit(1);
}

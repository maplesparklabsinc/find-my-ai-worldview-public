// The local Docker database (docker-compose.yml, issue #53) and the check every
// script that writes or wipes data runs first: it only ever acts on that
// database, never on Supabase or anything else a DATABASE_URL might point to.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const LOCAL_PORT = "54329";
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

const local = (db) => `postgres://fmaw:local@127.0.0.1:${LOCAL_PORT}/${db}`;
/** For npm run dev. */
export const LOCAL_DEV_URL = local("fmaw_dev");
/** For E2E_DB=1 tests. */
export const LOCAL_TEST_URL = local("fmaw_test");
/** The maintenance database, for dropping and creating the other two. */
export const LOCAL_ADMIN_URL = local("postgres");

/**
 * Why `url` is not the local Docker database, or null when it is. The message
 * names the host and port only, never the user name or password.
 */
export function notLocalReason(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return "DATABASE_URL is not a valid connection string.";
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return "DATABASE_URL is not a Postgres connection string.";
  const host = u.hostname.toLowerCase();
  const port = u.port || "5432";
  if (!LOCAL_HOSTS.includes(host) || port !== LOCAL_PORT) {
    return (
      `DATABASE_URL points at ${host}:${port}, not the local Docker database (127.0.0.1:${LOCAL_PORT}). ` +
      "This only runs against the local database, so it never changes a real one. Nothing changed."
    );
  }
  return null;
}

/** Why the load test refuses this app URL (issue #59), or null if it's on this computer. */
export function notLocalTarget(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return `Not a URL: ${target}`;
  }
  if (!LOCAL_HOSTS.includes(url.hostname)) return `The load test only runs against localhost or 127.0.0.1, not ${url.hostname}. Nothing was sent.`;
  return null;
}

/** DATABASE_URL from the environment or .env.local, else the local development database. */
export function databaseUrl(root) {
  if (!process.env.DATABASE_URL && existsSync(join(root, ".env.local"))) {
    process.loadEnvFile(join(root, ".env.local"));
  }
  return process.env.DATABASE_URL || LOCAL_DEV_URL;
}

/**
 * Why the seed may not write to `url`, or null when it may. Besides the local
 * Docker database, only the one host named in SEED_ALLOWED_HOST (a development
 * database such as Neon, set in .env.local), and never a Supabase host, so
 * production can't be seeded even if it is named there by mistake.
 */
export function notSeedableReason(url, allowedHost = process.env.SEED_ALLOWED_HOST) {
  const local = notLocalReason(url);
  if (!local) return null;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return local;
  }
  const allowed = (allowedHost ?? "").trim().toLowerCase();
  if (/(^|\.)supabase\.(co|com)$/.test(host)) return `${local} A Supabase host is never seeded.`;
  if (allowed && host === allowed) return null;
  return `${local} To seed a development database elsewhere, name its host in SEED_ALLOWED_HOST (.env.local).`;
}

/** Exit non-zero, saying why, unless `url` is the local Docker database. */
export function requireLocal(url) {
  const reason = notLocalReason(url);
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
}

/** Exit non-zero, saying why, unless the seed may write to `url` (notSeedableReason). */
export function requireSeedable(url) {
  const reason = notSeedableReason(url);
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
}

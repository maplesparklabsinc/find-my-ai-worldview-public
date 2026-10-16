// Apply the SQL files in db/migrations/ in name order, each once, each in its
// own transaction. Applied names are recorded in schema_migrations.
//
//   npm run db:migrate            # uses DATABASE_URL from the environment or .env.local
//   npm run db:migrate -- --dry   # list what would run
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "db", "migrations");
const dry = process.argv.includes("--dry");

if (!process.env.DATABASE_URL && existsSync(join(root, ".env.local"))) {
  process.loadEnvFile(join(root, ".env.local"));
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (environment or .env.local).");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
  await sql`alter table schema_migrations enable row level security`;
  await sql`revoke all on schema_migrations from anon, authenticated`;

  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const pending = files.filter((f) => !applied.has(f));

  const host = new URL(url).hostname;
  console.log(`${host}: ${applied.size} applied, ${pending.length} pending`);
  for (const f of pending) {
    if (dry) {
      console.log(`  would apply ${f}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, f), "utf8"));
      await tx`insert into schema_migrations (name) values (${f})`;
    });
    console.log(`  applied ${f}`);
  }
} catch (e) {
  console.error(`Migration failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}

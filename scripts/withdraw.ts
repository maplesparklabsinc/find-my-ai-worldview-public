// Withdraw one person from research contact (issue #21, PR-03). The privacy page
// says "To be removed, email us and we'll delete it", so this deletes the row
// rather than setting research_contacts.withdrawn. It also clears the address from
// any feedback they left (the feedback itself stays), so no copy of it is kept.
//
//   npm run withdraw -- <email>      # DATABASE_URL from the environment or .env.local
//
// Matches on the trimmed, lower-cased address, as it was stored (lib/submit).
// Never prints or logs the address: the output is a count only.
import { existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const root = new URL("..", import.meta.url).pathname;

if (!process.env.DATABASE_URL && existsSync(join(root, ".env.local"))) {
  process.loadEnvFile(join(root, ".env.local"));
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (environment or .env.local).");
  process.exit(1);
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
  console.error("Usage: npm run withdraw -- <email>. Nothing changed.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [n, f] = await sql.begin(async (tx) => {
    const contacts = await tx`delete from research_contacts where lower(trim(email)) = ${email} returning 1`;
    const feedback = await tx`update feedback set email = null where lower(trim(email)) = ${email} returning 1`;
    return [contacts.length, feedback.length];
  });
  console.log(n === 0 ? "No matching row." : n === 1 ? "Deleted 1 row." : `Deleted ${n} rows.`);
  if (f > 0) console.log(`Cleared the email from ${f} feedback ${f === 1 ? "entry" : "entries"}.`);
} catch (e) {
  // Postgres errors don't echo parameters, but strip the address in case one ever does.
  console.error(`Withdrawal failed, nothing changed: ${e instanceof Error ? e.message.replaceAll(email, "<address>") : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}

// The checks `npm run publish:public` runs on the export before anything is
// committed to the public repo (issue #43). Pure apart from reading the folder,
// so it can be tested on a fixture. A finding names the file, line and kind,
// never the matched text.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** The only addresses the public snapshot may contain. */
export const ALLOWED_EMAILS = ["findmyaiworldview@maplesparklabs.com", "noreply@anthropic.com"];

// Domains reserved for examples (RFC 2606, RFC 6761), as used in tests: never a real inbox.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;

export const PATTERNS = [
  { kind: "private session link", re: /claude\.ai\/code\/session_/i },
  { kind: "private artifact link", re: /claude\.ai\/artifact\//i },
  { kind: "Google Docs link", re: /docs\.google\.com/i },
  { kind: "Google Drive link", re: /drive\.google\.com/i },
  { kind: "Postgres connection string", re: /postgres(ql)?:\/\//i },
  { kind: "Supabase address", re: /supabase\.co/i },
];

export function emailAllowed(address) {
  const a = address.toLowerCase();
  return ALLOWED_EMAILS.includes(a) || RESERVED_DOMAIN.test(a.slice(a.lastIndexOf("@") + 1));
}

/** Findings in one file's text: [{ line, kind }]. */
export function scanText(text) {
  const findings = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(EMAIL)) {
      if (!emailAllowed(m[0])) findings.push({ line: i + 1, kind: "email address" });
    }
    for (const p of PATTERNS) if (p.re.test(line)) findings.push({ line: i + 1, kind: p.kind });
  });
  return findings;
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** Findings across a folder: [{ file, line, kind }]. Binary files (with a NUL byte) are skipped. */
export function scanFolder(dir) {
  const findings = [];
  for (const file of listFiles(dir)) {
    const buf = readFileSync(join(dir, file));
    if (buf.includes(0)) continue;
    for (const f of scanText(buf.toString("utf8"))) findings.push({ file, ...f });
  }
  return findings;
}

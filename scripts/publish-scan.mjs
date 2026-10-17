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
  { kind: "Supabase address", re: /supabase\.co/i },
];

// A connection string's host: after "user:password@" if there is one, up to the port, path or query.
const POSTGRES_URL = /postgres(?:ql)?:\/\/(?:[^\s@/]*@)?(\[[^\]\s]*\]|[^\s:/?#'"`]*)/gi;
// The local Docker database (docker-compose.yml) listens only on this computer, so its URL is fine to publish.
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

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
    for (const m of line.matchAll(POSTGRES_URL)) {
      if (!LOCAL_HOSTS.includes(m[1].toLowerCase())) findings.push({ line: i + 1, kind: "Postgres connection string" });
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

/**
 * Operations words that usually belong in the private docs/ops/ (CLAUDE.md, "What
 * goes in this repo"). Warnings only: the publish goes ahead, but each one is
 * worth a second look before pushing.
 */
export const OPS_WORDS = [
  { kind: "lockout", re: /\block-?out\b/i },
  { kind: "hosting plan", re: /\b(free|pro|paid|hobby|team) plan\b/i },
  { kind: "backup", re: /\bbackups?\b/i },
  { kind: "incident", re: /\bincidents?\b/i },
  { kind: "runbook", re: /\brunbooks?\b/i },
];

/** Where an operations word shows up in the export: [{ file, line, kind }]. Licence texts and this scan's own files are skipped. */
export function opsWarnings(dir) {
  const out = [];
  for (const file of listFiles(dir)) {
    if (/(^|\/)(LICEN[CS]E|OFL\.txt)/i.test(file) || /(^|\/)publish-scan\.(mjs|test\.ts)$/.test(file)) continue;
    const buf = readFileSync(join(dir, file));
    if (buf.includes(0)) continue;
    buf
      .toString("utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const w of OPS_WORDS) if (w.re.test(line)) out.push({ file, line: i + 1, kind: w.kind });
      });
  }
  return out;
}

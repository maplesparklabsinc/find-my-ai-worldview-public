// Build the next commit of the public snapshot repo (issue #43). This repo stays
// private; at each release this exports the tracked files, leaves out agent
// instructions and CI, scans what's left, and commits it as one commit in a
// local clone of the public repo. It never pushes: review it, then push yourself.
//
//   npm run publish:public -- --to <clone of the public repo> [--rev <git rev>] [--dry]
//
// --dry exports, filters and scans into a temp folder (kept, so it can be read),
// prints the summary and commits nothing. --to is optional with --dry; given, the
// summary lists what would change against it.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listFiles, opsWarnings, scanFolder } from "./publish-scan.mjs";

const root = new URL("..", import.meta.url).pathname;
const AUTHOR = { name: "Maple Spark Labs", email: "findmyaiworldview@maplesparklabs.com" };

// Always left out, whatever scripts/public-exclude.txt says. A trailing / is a folder.
const ALWAYS_EXCLUDED = ["CLAUDE.md", "AGENTS.md", ".github/", "test-results/", "private/"];

const NOTICE = `This is a published snapshot of Find My AI Worldview, updated at each release. Development happens in a private repository, so issue and pull request numbers mentioned in the code and docs refer to that tracker and won't resolve here. To report a problem, use the "Tell us" page on the site. For questions or collaboration, email findmyaiworldview@maplesparklabs.com. For the main design decisions and trade-offs, start with \`docs/05-design-notes.md\`; the dated record is \`docs/decisions.md\`.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", ...opts });
}

// --- Arguments
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dry = args.includes("--dry");
const rev = opt("--rev") ?? "HEAD";
const to = opt("--to") ? resolve(opt("--to")) : undefined;
if (!to && !dry) fail("Usage: npm run publish:public -- --to <clone of the public repo> [--rev <git rev>] [--dry]");
if (to && !existsSync(join(to, ".git"))) fail(`${to} is not a git clone (no .git folder).`);

// --- 1. Clean tree, and the revision is on main
if (git(["status", "--porcelain", "--untracked-files=no"]).trim()) {
  fail("The working tree has uncommitted changes. Commit or stash them first.");
}
let sha;
try {
  sha = git(["rev-parse", "--verify", `${rev}^{commit}`]).trim();
} catch {
  fail(`${rev} is not a commit.`);
}
try {
  git(["merge-base", "--is-ancestor", sha, "main"]);
} catch {
  fail(`${rev} is not on main. Publish only what has been merged.`);
}
const short = sha.slice(0, 7);

// --- 2. Export the tracked files at the revision (ignored files can't come along)
const out = mkdtempSync(join(tmpdir(), "fmaw-public-"));
execFileSync("tar", ["-x", "-C", out], { input: git(["archive", "--format=tar", sha], { encoding: "buffer", maxBuffer: 1 << 30 }) });

// --- 3. Leave out agent instructions, CI and anything listed in public-exclude.txt
const listed = readFileSync(join(out, "scripts/public-exclude.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const rules = [...new Set([...ALWAYS_EXCLUDED, ...listed])];
const matches = (file, rule) => (rule.endsWith("/") ? file.startsWith(rule) : file === rule);
const excluded = [];
for (const file of listFiles(out)) {
  const isEnv = file.split("/").pop().startsWith(".env");
  if (isEnv || rules.some((r) => matches(file, r))) {
    excluded.push(file);
    rmSync(join(out, file));
  }
}
// Drop folders left empty.
const prune = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) prune(join(d, e.name));
  if (d !== out && readdirSync(d).length === 0) rmSync(d, { recursive: true });
};
prune(out);

// --- 4. Scan; stop on any finding (file and line only, never the value)
const findings = scanFolder(out).map((f) => `${f.file}:${f.line}  ${f.kind}`);
const report = join(mkdtempSync(join(tmpdir(), "fmaw-gitleaks-")), "report.json");
try {
  execFileSync("gitleaks", ["dir", out, "--redact", "--no-banner", "--log-level", "error", "--report-format", "json", "--report-path", report, "--exit-code", "0"], { stdio: ["ignore", "ignore", "inherit"] });
} catch (e) {
  fail(e.code === "ENOENT" ? "gitleaks is not installed (brew install gitleaks). Nothing published." : "gitleaks failed to run. Nothing published.");
}
for (const leak of JSON.parse(readFileSync(report, "utf8") || "[]")) {
  findings.push(`${leak.File.slice(out.length + 1)}:${leak.StartLine}  secret (gitleaks rule ${leak.RuleID})`);
}
rmSync(join(report, ".."), { recursive: true, force: true });

// --- 5. Files the public repo needs and this one doesn't
if (!existsSync(join(out, "content/LICENSE"))) findings.push("content/LICENSE  missing (the content licence)");
writeFileSync(join(out, "NOTICE.md"), NOTICE);

// --- What changes against the last public commit
function changes() {
  if (!to) return null;
  const before = new Set(listFiles(to).filter((f) => f !== ".git" && !f.startsWith(".git/")));
  const after = listFiles(out);
  const same = (f) => readFileSync(join(to, f)).equals(readFileSync(join(out, f)));
  return {
    added: after.filter((f) => !before.has(f)),
    changed: after.filter((f) => before.has(f) && !same(f)),
    removed: [...before].filter((f) => !after.includes(f)),
  };
}
const diff = changes();

// --- 6. Version line for the commit
const json = (f) => JSON.parse(readFileSync(join(out, "content", f), "utf8"));
const v = {
  scoring: json("scoring-config.json").scoring_version,
  taxonomy: json("perspectives.json").taxonomy_version,
  items: json("items.json").item_bank_version,
  narratives: json("narratives.json").narratives_version,
  copy: json("copy.json").copy_version,
};
const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const subject = `Release ${v.scoring}-${v.taxonomy}-${v.items}-${v.narratives} (${today})`;
const body = `Copy version ${v.copy}.\nPrivate commit ${short}.`;

// --- 7. Summary
const list = (title, files) => {
  console.log(`\n${title} (${files.length})`);
  for (const f of files) console.log(`  ${f}`);
};
console.log(`Public snapshot of ${short}${dry ? " (dry run)" : ""}`);
console.log(`Export: ${out}`);
console.log(`Commit: ${subject}`);
list("Excluded", excluded);
if (diff) {
  list("Added since the last public commit", diff.added);
  list("Changed", diff.changed);
  list("Removed", diff.removed);
} else {
  console.log(`\nFiles in the snapshot: ${listFiles(out).length} (no --to given, so no comparison)`);
}
console.log(`\nScan: ${findings.length === 0 ? "passed, nothing found" : `${findings.length} finding(s)`}`);
for (const f of findings) console.log(`  ${f}`);

// Operations words: a warning, not a stop. They usually belong in docs/ops/ (private).
const warnings = opsWarnings(out);
if (warnings.length > 0) {
  console.log(`\nWorth a second look (operations words; these usually belong in docs/ops/): ${warnings.length}`);
  for (const w of warnings) console.log(`  ${w.file}:${w.line}  ${w.kind}`);
}

if (findings.length > 0) {
  fail(`\nStopped: fix the findings above (or list a file in scripts/public-exclude.txt), commit, and run again. Nothing was committed. The export is at ${out}.`);
}
if (dry) {
  console.log(`\nDry run: nothing committed. Read the export at ${out}; delete it when you're done.`);
  process.exit(0);
}

// --- 6 (continued). Replace everything in the clone except .git, then one commit
if (diff.added.length + diff.changed.length + diff.removed.length === 0) {
  rmSync(out, { recursive: true, force: true });
  console.log("\nThe public repo already matches this snapshot. Nothing to commit.");
  process.exit(0);
}
for (const e of readdirSync(to)) if (e !== ".git") rmSync(join(to, e), { recursive: true, force: true });
cpSync(out, to, { recursive: true });
rmSync(out, { recursive: true, force: true });
const inTo = (a) => execFileSync("git", ["-C", to, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
inTo(["add", "-A"]);
execFileSync("git", ["-C", to, "-c", `user.name=${AUTHOR.name}`, "-c", `user.email=${AUTHOR.email}`, "commit", "-q", "-m", subject, "-m", body], {
  env: { ...process.env, GIT_AUTHOR_NAME: AUTHOR.name, GIT_AUTHOR_EMAIL: AUTHOR.email, GIT_COMMITTER_NAME: AUTHOR.name, GIT_COMMITTER_EMAIL: AUTHOR.email },
  stdio: "inherit",
});
console.log(`\nCommitted ${inTo(["rev-parse", "--short", "HEAD"]).trim()} in ${to}.`);
console.log(`Review with \`git -C ${to} show --stat\`, then push it yourself.`);

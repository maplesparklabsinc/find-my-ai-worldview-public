// Load test for the save routes (issue #59). Local only: it refuses any host
// but localhost or 127.0.0.1, so it can never reach production. It starts
// nothing itself; run the app first.
//
//   npm run load-test                                  # 300 people against http://127.0.0.1:3000
//   npm run load-test -- http://localhost:3200 --people 1000 [--ramp 120]
//
// Simulated people arrive evenly over the ramp (default 2 minutes). Each one
// sends a valid completed quiz, built from a reference answer pattern and
// scored with lib/scoring for the quick check, then 2 or 3 follow-up writes a
// few seconds apart: a fit rating, the track checks and sometimes a research
// email at example.com. Each person has their own made-up client address
// (x-forwarded-for), so the per-client rate limit counts them separately, as
// it would for real people.
//
// It tests the app and our code against whatever database the app uses, not
// Supabase's limits.
import { pathToFileURL } from "node:url";
import vectors from "@/reference/test-vectors.json";
import { getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { EDIT_TOKEN_HEADER } from "@/lib/edit-token/header";
import { SEQUENCE_VERSION, mulberry32, standardSequence, stepItem } from "@/lib/form";
import { quickCheckPlan } from "@/lib/quickcheck";
import { score, type Answers } from "@/lib/scoring";
import { TRACK_CHECKS, checkResponse } from "@/lib/submit";
import { notLocalTarget } from "./local-db.mjs";

function args(argv: string[]) {
  let target = "http://127.0.0.1:3000";
  let people = 300;
  let ramp = 120;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--people") people = Number(argv[++i]);
    else if (a === "--ramp") ramp = Number(argv[++i]);
    else if (!a.startsWith("--")) target = a;
  }
  if (!Number.isInteger(people) || people < 1) throw new Error("--people must be a whole number above 0");
  if (!Number.isFinite(ramp) || ramp < 0) throw new Error("--ramp must be seconds, 0 or more");
  return { target: target.replace(/\/$/, ""), people, ramp };
}

const content = getContent();
const copy = getCopy();
const rand = mulberry32(59);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const patterns = vectors.score_cases.map((v) => v.answers as Answers);

function quiz() {
  const seed = int(0, 0xffffffff);
  const base = pick(patterns);
  const answers: Answers = {};
  for (const step of standardSequence(content, seed).steps) {
    let v = base[step.key];
    if (typeof v === "number" && stepItem(content, step).format === "L7" && step.kind !== "confidence_probe" && rand() < 0.2) {
      v = Math.min(7, Math.max(1, v + pick([-1, 1])));
    }
    if (v !== undefined) answers[step.key] = v;
  }
  const timings = Object.fromEntries(Object.keys(answers).map((k) => [k, int(3_000, 20_000)]));
  const result = score(content, answers);
  const plan = quickCheckPlan(content, seed, result, { show: copy.quick_check.show_share, own: copy.quick_check.own_share });
  const payload = {
    form: content.config.form,
    seed,
    sequence_version: SEQUENCE_VERSION,
    answers,
    timings_ms: timings,
    quick_check: plan ? { ...plan, rating: int(1, 5) } : undefined,
    prediction: plan ? undefined : { kind: "skipped" },
    submission_key: crypto.randomUUID(),
  };
  const checked = checkResponse(content, payload);
  if (!checked.ok) throw new Error(`built an invalid quiz: ${checked.error}`);
  const scored = Object.entries(checked.value.result.constructs)
    .filter(([, s]) => s.score !== null)
    .map(([k]) => k);
  return { payload, scored };
}

interface Sample {
  route: string;
  status: number | "network";
  ms: number;
}

const samples: Sample[] = [];

async function request(target: string, route: string, init: RequestInit, ip: string): Promise<Response | null> {
  const started = performance.now();
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", ip);
  try {
    const res = await fetch(`${target}${route}`, { ...init, headers });
    samples.push({ route: route.replace(/\/[A-Za-z0-9]{12,32}$/, "/[id]"), status: res.status, ms: performance.now() - started });
    return res;
  } catch {
    samples.push({ route, status: "network", ms: performance.now() - started });
    return null;
  }
}

async function person(target: string, n: number) {
  const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
  const { payload, scored } = quiz();
  const res = await request(target, "/api/responses", { method: "POST", body: JSON.stringify(payload) }, ip);
  if (!res?.ok) return;
  const { id, token } = (await res.json()) as { id: string; token: string };
  const auth = { [EDIT_TOKEN_HEADER]: token };
  const followUps: (() => Promise<unknown>)[] = [
    () => request(target, `/api/responses/${id}`, { method: "PATCH", headers: auth, body: JSON.stringify({ fit_rating: int(1, 5) }) }, ip),
    () =>
      request(
        target,
        `/api/responses/${id}`,
        { method: "PATCH", headers: auth, body: JSON.stringify({ track_checks: Object.fromEntries(scored.map((k) => [k, pick(TRACK_CHECKS)])) }) },
        ip,
      ),
  ];
  if (rand() < 0.3) {
    const body = { email: `load-${n}@example.com`, response_id: id, consent_version: copy.research_consent.consent_version, consent: true };
    followUps.push(() => request(target, "/api/research-contact", { method: "POST", headers: auth, body: JSON.stringify(body) }, ip));
  }
  for (const send of followUps) {
    await sleep(int(3_000, 15_000));
    await send();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summary(people: number, seconds: number) {
  const ms = (xs: number[]) => xs.map((x) => `${Math.round(x)} ms`);
  const lines = [`${people} people, ${samples.length} requests in ${seconds.toFixed(0)} s (${(samples.length / seconds).toFixed(1)} a second)`];
  const byRoute = new Map<string, Sample[]>();
  for (const s of samples) byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s]);
  for (const [route, xs] of [...byRoute].sort()) {
    const times = xs.filter((s) => typeof s.status === "number" && s.status < 400).map((s) => s.ms).sort((a, b) => a - b);
    const [p50, p95, p99] = ms([50, 95, 99].map((p) => percentile(times, p)));
    lines.push(`  ${route}: ${xs.length} requests; saved in p50 ${p50}, p95 ${p95}, p99 ${p99}`);
  }
  const errors = new Map<string, number>();
  for (const s of samples) if (s.status === "network" || s.status >= 400) errors.set(String(s.status), (errors.get(String(s.status)) ?? 0) + 1);
  lines.push(errors.size === 0 ? "  errors: none" : `  errors: ${[...errors].map(([k, v]) => `${k} ×${v}`).join(", ")}`);
  return lines.join("\n");
}

async function main() {
  const { target, people, ramp } = args(process.argv.slice(2));
  const refused = notLocalTarget(target);
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
  console.log(`Load test: ${people} people over ${ramp} s against ${target}`);
  const started = performance.now();
  const gap = people > 1 ? (ramp * 1000) / (people - 1) : 0;
  const runs: Promise<void>[] = [];
  for (let n = 0; n < people; n++) {
    runs.push(sleep(n * gap).then(() => person(target, n)));
  }
  await Promise.all(runs);
  console.log(summary(people, (performance.now() - started) / 1000));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

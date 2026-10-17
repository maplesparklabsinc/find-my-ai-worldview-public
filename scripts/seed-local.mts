// Fill the local development database with made-up data (issue #53), so /admin
// and the result pages have something to show. Never real data: every answer
// pattern starts from a reference test vector, and every address is at
// example.com. Never copy or export production data into it.
//
//   npm run db:seed      # DATABASE_URL from the environment or .env.local, else fmaw_dev
//
// Refuses anything but the local Docker database, or the one development host
// named in SEED_ALLOWED_HOST, never Supabase (scripts/local-db.mjs). It
// empties the three tables first and draws everything from a fixed seed, so
// running it twice gives the same data, dated relative to today.
//
// Rows go through the same checks and writes as the API routes (lib/submit,
// lib/db), so every stored result is one the scorer really produces.
import postgres from "postgres";
import vectors from "@/reference/test-vectors.json";
import { statementKeys } from "@/lib/admin/quality";
import { contentVersions, getContent, type Content } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";
import { loadReleaseByKey, releaseKey, releaseKeys } from "@/lib/content/release";
import { db, insertFeedback, insertResearchContact, insertResponse, patchResponse } from "@/lib/db";
import { hashEditToken } from "@/lib/edit-token";
import { SEQUENCE_VERSION, mulberry32, shuffle, standardSequence, stepItem } from "@/lib/form";
import type { Prediction } from "@/lib/prediction";
import { quickCheckPlan } from "@/lib/quickcheck";
import { score, type AnswerValue, type Answers } from "@/lib/scoring";
import { BETTER_FIT_OTHER, TRACK_CHECKS, checkFeedback, checkPatch, checkResearchContact, checkResponse } from "@/lib/submit";
import { databaseUrl, requireSeedable } from "./local-db.mjs";

const root = new URL("..", import.meta.url).pathname;
const url = databaseUrl(root);
requireSeedable(url);
// lib/db reads DATABASE_URL.
process.env.DATABASE_URL = url;

const RESPONSES = 60;
const PREVIOUS_RELEASE = 5;
const RESEARCH = 15;
const WITHDRAWN = 2;
const DAYS = 30;
// A few responses the admin quality flags (issue #55) should catch: these
// current-release rows rush the statements, or give one answer throughout.
const RUSHED = new Set([12, 31, 47]);
const SAME_ANSWER = new Set([20, 44]);

const rand = mulberry32(20261016);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const fakeId = () => Array.from({ length: 14 }, () => pick(ALNUM.split(""))).join("");
const hex = (n: number) => Array.from({ length: n }, () => int(0, 15).toString(16)).join("");
const fakeUuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(["8", "9", "a", "b"])}${hex(3)}-${hex(12)}`;

// One reference vector per perspective and per other outcome; copies of them,
// with some answers moved a step, fill the rest.
const PATTERNS = [
  "accelerator", "steward", "precautionist", "skeptic", "human_control", "fair_share", "pragmatist",
  "mixed_between", "mixed_unmatched", "undecided_confidence", "undecided_coverage", "all_neither_settled",
  "indifferent", "low_interest", "oversight_no_trust", "caution_then_speed", "cx_depends", "tie_just_under",
];
const patternAnswers = (id: string): Answers => {
  const v = vectors.score_cases.find((x) => x.id === id);
  if (!v) throw new Error(`no test vector ${id}`);
  return v.answers as Answers;
};

// The first has an address in it, so the masking on /admin shows.
const FREE_TEXT = [
  "Happy to talk more about this, write to me at reader.one@example.com",
  "I worry most about jobs in my town.",
  "Hard to pick, it depends so much on who builds it.",
  "Mostly curious. I use it for recipes and emails.",
  "My kids use it for school and I'm not sure how I feel.",
  "Useful, but I don't trust the companies behind it.",
  "Cautiously hopeful.",
  "It's moving faster than the rules.",
  "Good for science, worried about everything else.",
];

/** A random valid answer for a question the pattern leaves out: the trade-off cards and the "about you" ones. */
function extraAnswer(c: Content, key: string): AnswerValue | undefined {
  const item = c.itemsById.get(key);
  if (!item) return undefined;
  switch (item.format) {
    case "SC":
    case "CAT":
      return int(0, item.options.length - 1);
    case "GRID":
      return Object.fromEntries(item.rows.map((r) => [r, int(0, item.options.length - 1)]));
    case "TO":
      return { choice: int(0, 1) as 0 | 1, strength: pick(["slightly", "strongly"] as const) };
    default:
      return undefined;
  }
}

function answersFor(c: Content, seed: number, pattern: string, jitter: boolean, freeText: string | null): Answers {
  const base = patternAnswers(pattern);
  const out: Answers = {};
  for (const step of standardSequence(c, seed).steps) {
    const item = stepItem(c, step);
    let v: AnswerValue | undefined = base[step.key];
    if (v === undefined && step.kind === "item" && !step.sectionConstruct && chance(0.85)) v = extraAnswer(c, step.key);
    if (item.format === "TXT") v = freeText ?? undefined;
    // The reference vectors all say Canada; spread the made-up people over every option, more in Canada and the US.
    if (step.key === "D11" && v !== undefined) v = pick([0, 0, 0, 1, 1, ...item.options.keys()]);
    if (jitter && typeof v === "number" && item.format === "L7" && step.kind !== "confidence_probe" && chance(0.2)) {
      v = Math.min(7, Math.max(1, v + pick([-1, 1])));
    }
    if (v !== undefined) out[step.key] = v;
  }
  return out;
}

function prediction(c: Content): Prediction {
  const ids = c.perspectives.perspectives.map((p) => p.id);
  const r = rand();
  if (r < 0.25) return { kind: "skipped" };
  if (r < 0.6) return { kind: "perspective", perspectives: [pick(ids)] };
  if (r < 0.75) {
    const [a, b] = shuffle(ids, rand);
    return { kind: "between", perspectives: [a, b] };
  }
  return { kind: pick(["own_combination", "forming", "not_priority"] as const) };
}

interface Seeded {
  id: string;
  daysAgo: number;
  closest: string | null;
  scored: string[];
}

async function main() {
  const sql = db();
  const copy = getCopy();
  const current = getContent();
  const currentKey = releaseKey(contentVersions(current));
  const previousKey = (await releaseKeys()).filter((k) => k !== currentKey).at(-1);
  const previous = previousKey ? (await loadReleaseByKey(previousKey))?.content : undefined;
  if (!previous) throw new Error("no previous content release is frozen");

  await sql`truncate responses, research_contacts, feedback restart identity cascade`;

  const seeded: Seeded[] = [];
  const total = RESPONSES + PREVIOUS_RELEASE;
  let textUsed = 0;
  for (let i = 0; i < total; i++) {
    const old = i < PREVIOUS_RELEASE;
    const c = old ? previous : current;
    const seed = int(0, 0xffffffff);
    const pattern = PATTERNS[i % PATTERNS.length];
    // Most people write something; the first one written has an address in it.
    const freeText = chance(0.6) ? (textUsed++ === 0 ? FREE_TEXT[0] : pick(FREE_TEXT.slice(1))) : null;
    const answers = answersFor(c, seed, pattern, i >= PATTERNS.length, freeText);
    if (SAME_ANSWER.has(i)) for (const k of statementKeys(c)) if (k in answers) answers[k] = 4;
    // Rushed: about a second a statement, but long enough overall to be saved (60 s).
    const statements = new Set(statementKeys(c));
    const time = (k: string) => (RUSHED.has(i) ? (statements.has(k) ? int(700, 1_400) : int(5_000, 8_000)) : int(3_000, 20_000));
    const timings = Object.fromEntries(Object.keys(answers).map((k) => [k, time(k)]));
    const changed = chance(0.15) ? Object.fromEntries([[pick(Object.keys(answers)), int(1, 3)]]) : undefined;

    // Older (earlier) responses first, so compare links point back in time.
    const daysAgo = Math.max(0, Math.round(((total - 1 - i) / total) * (DAYS - 1)) - int(0, 1));
    const comparable = seeded.filter((s) => s.daysAgo >= daysAgo);
    const comparedWith = !old && comparable.length > 0 && chance(0.1) ? pick(comparable).id : undefined;

    // Who sees the quick check is drawn from the seed and result, as in the browser.
    const plan = quickCheckPlan(c, seed, score(c, answers), { show: copy.quick_check.show_share, own: copy.quick_check.own_share });

    const payload = {
      form: c.config.form,
      seed,
      sequence_version: SEQUENCE_VERSION,
      answers,
      timings_ms: timings,
      answer_changes: changed,
      quick_check: plan ? { ...plan, rating: int(1, 5) } : undefined,
      compared_with: comparedWith,
      // People shown the quick check aren't asked for a guess, as in the app. A few
      // older rows come from before the guess was asked.
      prediction: plan || (old && chance(0.6)) ? undefined : prediction(c),
      submission_key: fakeUuid(),
    };
    const checked = checkResponse(c, payload);
    if (!checked.ok) throw new Error(`pattern ${pattern}: ${checked.error}`);
    const id = await insertResponse(fakeId(), checked.value, hashEditToken(fakeId()));

    // Feedback on the result, as the result page sends it.
    const scored = Object.entries(checked.value.result.constructs)
      .filter(([, s]) => s.score !== null)
      .map(([k]) => k);
    const patch: Record<string, unknown> = {};
    if (chance(0.7)) patch.fit_rating = int(1, 5);
    if (typeof patch.fit_rating === "number" && patch.fit_rating <= 2 && checked.value.closest_perspective) {
      // Never their own perspective: the result page doesn't offer it either.
      const own = checked.value.outcome_type === "matched" ? checked.value.closest_perspective : null;
      patch.better_fit = pick([...c.perspectives.perspectives.map((p) => p.id).filter((id) => id !== own), ...BETTER_FIT_OTHER]);
    }
    if (chance(0.4) && scored.length > 0) {
      patch.track_checks = Object.fromEntries(scored.map((k) => [k, pick(TRACK_CHECKS)]));
    }
    if (Object.keys(patch).length > 0) {
      const p = checkPatch(c, patch);
      if (!p.ok) throw new Error(p.error);
      await patchResponse(id, p.value);
    }

    seeded.push({ id, daysAgo, closest: checked.value.closest_perspective, scored });
  }

  // Research sign-ups, a couple of them withdrawn.
  const signups = shuffle(seeded, rand).slice(0, RESEARCH);
  for (const [n, s] of signups.entries()) {
    const r = checkResearchContact({
      email: `person${String(n + 1).padStart(2, "0")}@example.com`,
      response_id: s.id,
      consent_version: copy.research_consent.consent_version,
      consent: true,
    });
    if (!r.ok) throw new Error(r.error);
    await insertResearchContact(r.value);
  }
  await sql`
    update research_contacts set withdrawn = true
    where id in (select id from research_contacts order by id limit ${WITHDRAWN})`;

  // Feedback of every type, some with an address, two with one inside the text.
  const types = copy.feedback.problem_options.map((o) => o.id);
  const bodies = [
    "The question about who should decide was hard to read on my phone.",
    "This one felt like it wanted a particular answer.",
    "The description of my group is a bit harsh.",
    "I didn't see anyone like me. Maybe someone who cares mostly about kids and schools?",
    "I got Stewards but I think I'm closer to Pragmatists. You can reach me at sam.reader@example.com",
    "Where does the 2024 number come from?",
    "The back button jumped me two questions.",
    "Nice quiz. My partner got something different and we talked for an hour.",
    "Two of the questions sounded the same to me.",
    "Please email me at feedback.person@example.com if you change the wording.",
  ];
  for (const [n, body] of bodies.entries()) {
    const type = types[n % types.length];
    const attached = n % 3 === 0 ? seeded[seeded.length - 1 - n] : undefined;
    const f = checkFeedback(current, {
      type,
      item_ids: type.endsWith("question") ? ["C3-02"] : [],
      perspective_ids: type === "unfair_perspective" ? ["precautionists"] : [],
      body,
      email: n % 4 === 1 ? `tester${n}@example.com` : undefined,
      may_quote: n % 2 === 0,
      response_id: attached?.id,
    });
    if (!f.ok) throw new Error(f.error);
    await insertFeedback(f.value, n % 2 === 0);
  }

  // Spread over the last 30 days. Done last, since result feedback can only be
  // set on the day of completion and the day after.
  for (const s of seeded) {
    await sql`update responses set completed_on = current_date - ${s.daysAgo}::int where id = ${s.id}`;
    await sql`update research_contacts set created_on = current_date - ${s.daysAgo}::int where response_id = ${s.id}`;
  }
  await sql`update feedback set created_on = current_date - (id::int * 2 % ${DAYS})`;

  const outcomes = await sql<{ outcome: string; n: number }[]>`
    select coalesce(case when outcome_type = 'matched' then closest_perspective end, outcome_type || coalesce(' (' || outcome_reason || ')', '')) as outcome,
           count(*)::int as n
    from responses group by 1 order by 1`;
  const [counts] = await sql<{ responses: number; research: number; feedback: number }[]>`
    select (select count(*)::int from responses) as responses,
           (select count(*)::int from research_contacts) as research,
           (select count(*)::int from feedback) as feedback`;
  console.log(`Seeded ${counts.responses} responses (${PREVIOUS_RELEASE} under ${previousKey}), ${counts.research} research sign-ups (${WITHDRAWN} withdrawn), ${counts.feedback} feedback.`);
  console.log(outcomes.map((o) => `  ${o.outcome}: ${o.n}`).join("\n"));
}

try {
  await main();
} catch (e) {
  console.error(`Seeding failed: ${e instanceof postgres.PostgresError || e instanceof Error ? e.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await db().end();
}

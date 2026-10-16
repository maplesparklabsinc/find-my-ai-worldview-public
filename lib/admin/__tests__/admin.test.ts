import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addDays, buildDashboard, countOf, itemText, niceMax, plural, type AdminRaw } from "@/lib/admin";
import { contentVersions, getContent } from "@/lib/content";
import { getCopy } from "@/lib/content/copy";

const c = getContent();
const copy = getCopy();
const v = contentVersions(c);

const EMPTY: AdminRaw = {
  today: "2026-10-13",
  totals: { today: 0, last_7_days: 0, all_time: 0 },
  research_active: 0,
  daily: [],
  outcomes: [],
  fit: [],
  better_fit: [],
  rules_depend: [],
  tracks: [],
  skips: [],
  changes: [],
  feedback: [],
  feedback_last_7_days: 0,
};

const EMAIL = "someone@example.com";
const D9 = "my private words about AI";

// What the database could hand back if a query selected too much: the extra
// fields must never reach the page.
const leaky = { email: EMAIL, D9, answers: { D9 } };

const FIXTURE: AdminRaw = {
  today: "2026-10-13",
  totals: { today: 3, last_7_days: 10, all_time: 40 },
  research_active: 4,
  daily: [
    { day: "2026-10-13", n: 3 },
    { day: "2026-10-10", n: 7 },
    { day: "2026-09-14", n: 30 },
    { day: "2026-09-13", n: 99 }, // older than 30 days: not shown
  ],
  outcomes: [
    { outcome_type: "matched", perspective: "stewards", n: 12 },
    { outcome_type: "matched", perspective: "accelerators", n: 8 },
    { outcome_type: "mixed_between", perspective: null, n: 6 },
    { outcome_type: "undecided", perspective: null, n: 3 },
    { outcome_type: "mixed_unmatched", perspective: null, n: 1 },
  ],
  fit: [
    { perspective: "stewards", rating: 5, n: 4 },
    { perspective: "stewards", rating: 4, n: 2 },
    { perspective: "stewards", rating: 3, n: 1 },
    { perspective: "stewards", rating: 1, n: 3 },
    { perspective: "accelerators", rating: 4, n: 5 },
    { perspective: null, rating: 2, n: 1 },
    { perspective: null, rating: 5, n: 1 },
  ],
  better_fit: [
    { perspective: "stewards", pick: "pragmatists", n: 1 },
    { perspective: "stewards", pick: "own_mix", n: 2 },
  ],
  rules_depend: [
    { outcome_type: "matched", perspective: "stewards", choice: 0, strength: "strongly", n: 3 },
    { outcome_type: "matched", perspective: "stewards", choice: 0, strength: "slightly", n: 3 },
    { outcome_type: "matched", perspective: "stewards", choice: 1, strength: "slightly", n: 4 },
    { outcome_type: "matched", perspective: "pragmatists", choice: 0, strength: "strongly", n: 40 },
    { outcome_type: "mixed_between", perspective: null, choice: 1, strength: "strongly", n: 2 },
    { outcome_type: "indifferent", perspective: null, choice: 0, strength: "slightly", n: 1 },
  ],
  tracks: [
    { construct: "C1", answer: "about_right", n: 6 },
    { construct: "C1", answer: "further_low", n: 1 },
    { construct: "C1", answer: "further_high", n: 3 },
    { construct: "C5", answer: "further_high", n: 1 },
  ],
  skips: [
    { item: "D9", skip_rate: 0.61 },
    { item: "C4-06", skip_rate: 0.091 },
    { item: "D3:C2", skip_rate: 0.05 },
  ],
  changes: [{ item: "C5-04", total_changes: 41 }, { item: "C2-05", total_changes: 1 }],
  feedback: [
    {
      created_on: "2026-10-13",
      type: "confusing_question",
      item_ids: ["C5-04"],
      perspective_ids: ["accelerators"],
      body: "Hard to read.",
      may_quote: true,
      response_id: "abcdefghijklmn",
      attached_verified: true,
      has_email: true,
      ...leaky,
    },
    {
      created_on: "2026-10-01",
      type: "other",
      item_ids: [],
      perspective_ids: [],
      body: "Nice.",
      may_quote: false,
      response_id: null,
      attached_verified: false,
      has_email: false,
    },
  ],
  feedback_last_7_days: 1,
};

describe("admin dashboard", () => {
  const d = buildDashboard(FIXTURE, c, copy, v);

  it("shows the live content versions", () => {
    expect(d.versions).toBe(`${v.scoring} · ${v.taxonomy} · ${v.item_bank} · ${v.narratives}`);
  });

  it("totals and the research share", () => {
    expect(d.totals).toEqual({ today: 3, week: 10, allTime: 40, research: 4, researchShare: "10%" });
  });

  it("fills 30 days ending today, gaps as 0, today marked", () => {
    expect(d.days).toHaveLength(30);
    expect(d.days[0].date).toBe("2026-09-14");
    expect(d.days[29]).toMatchObject({ date: "2026-10-13", n: 3, today: true });
    expect(d.days.filter((x) => x.today)).toHaveLength(1);
    expect(d.days.reduce((s, x) => s + x.n, 0)).toBe(40);
    expect(d.days.find((x) => x.date === "2026-10-11")!.n).toBe(0);
    expect(d.peak).toBe("Sep 14 (30)");
    expect(d.daySummary).toContain("40 in total");
  });

  it("results: every outcome listed, named perspectives first, counts reconcile", () => {
    const names = c.perspectives.perspectives.map((p) => p.name);
    expect(d.outcomes).toHaveLength(names.length + 4);
    expect(d.outcomes.slice(0, names.length).every((o) => o.named)).toBe(true);
    expect(d.outcomes.slice(names.length).map((o) => o.name)).toEqual([
      "In between",
      "Still forming",
      "Your own combination",
      "Not a priority",
    ]);
    expect(d.outcomes[0]).toMatchObject({ name: "Stewards", n: 12, pct: "40%", width: 1 });
    expect(d.outcomes.reduce((s, o) => s + o.n, 0)).toBe(d.outcomesTotal);
    expect(d.outcomesTotal).toBe(30);
  });

  it("fit: only rated perspectives, then other results together, shares of those who rated, flags", () => {
    expect(d.fit.map((f) => f.name)).toEqual(["Accelerators", "Stewards", "Other results"]);
    expect(d.fit[2]).toMatchObject({ n: 2, well: "50%", poor: "50%", poorFlag: true, picked: "–" });
    const s = d.fit.find((f) => f.name === "Stewards")!;
    expect(s).toMatchObject({ n: 10, well: "60%", poor: "30%", poorFlag: false, few: true, picked: copy.fit.better_own_mix });
    const a = d.fit.find((f) => f.name === "Accelerators")!;
    expect(a).toMatchObject({ n: 5, well: "100%", poor: "0%", picked: "–" });
  });

  it("rules for low-risk AI: perspectives, then other outcomes, shares of those who answered", () => {
    const names = c.perspectives.perspectives.map((p) => p.name).filter((n) => n === "Stewards" || n === "Pragmatists");
    expect(d.rulesDepend.map((r) => r.name)).toEqual([...names, "In between", "Not a priority"]);
    expect(d.rulesDepend.find((r) => r.name === "Stewards")).toEqual({
      name: "Stewards",
      n: 10,
      depends: "60%",
      strongly: "30%",
      few: true,
      named: true,
    });
    expect(d.rulesDepend.find((r) => r.name === "Pragmatists")).toMatchObject({ n: 40, depends: "100%", strongly: "100%", few: false });
    expect(d.rulesDepend.find((r) => r.name === "In between")).toMatchObject({ n: 2, depends: "0%", strongly: "0%", named: false });
  });

  it("track checks: one row per question in order, bands collapsed, sides over 30% flagged", () => {
    expect(d.tracks.map((t) => t.question)).toEqual(c.config.scored_constructs.map((k) => c.narratives.constructs[k].question));
    expect(d.tracks[0]).toMatchObject({ n: 10, ok: "60%", further_low: "10%", further_high: "30%", lowFlag: false, highFlag: false });
    const c5 = d.tracks[c.config.scored_constructs.indexOf("C5")];
    expect(c5).toMatchObject({ n: 1, ok: "0%", further_high: "100%", highFlag: true, few: true });
    expect(d.tracks.find((t) => t.n === 0)!.ok).toBe("–");
  });

  it("questions to look at use short text, or the stem", () => {
    expect(d.skipped.map((s) => s.value)).toEqual(["61%", "9%", "5%"]);
    expect(d.skipped[1].text).toBe(c.itemsById.get("C4-06")!.short);
    expect(d.skipped[0].text).toBe(c.itemsById.get("D9")!.stem);
    expect(d.changed.map((x) => x.value)).toEqual(["41 times", "once"]);
    expect(itemText(c, "D3:C2")).toContain(c.narratives.constructs.C2.question);
    expect(itemText(c, "nope")).toBe("");
  });

  it("feedback rows: labels, result link, reply as yes/no", () => {
    expect(d.feedback[0]).toEqual({
      date: "Oct 13",
      type: copy.feedback.problem_options.find((o) => o.id === "confusing_question")!.label,
      about: "C5-04, Accelerators",
      body: "Hard to read.",
      result: "/r/abcdefghijklmn",
      resultLabel: "Their result",
      quote: "Yes",
      reply: "Email given",
    });
    expect(d.feedback[1]).toMatchObject({ about: "", result: null, quote: "No", reply: "No" });
    expect(d.feedbackWeek).toBe(1);
  });

  it("an attachment sent without the result's edit token reads as unverified", () => {
    const raw = { ...FIXTURE, feedback: [{ ...FIXTURE.feedback[0], attached_verified: false }] };
    expect(buildDashboard(raw, c, copy, v).feedback[0]).toMatchObject({
      result: "/r/abcdefghijklmn",
      resultLabel: "Attached result (unverified)",
    });
  });

  it("never passes on an email address or D9 text", () => {
    const json = JSON.stringify(d);
    expect(json).not.toContain(EMAIL);
    expect(json).not.toContain(D9);
    expect(json).not.toMatch(/@/);
  });

  it("an empty database renders zeros and empty lists", () => {
    const e = buildDashboard(EMPTY, c, copy, v);
    expect(e.totals).toEqual({ today: 0, week: 0, allTime: 0, research: 0, researchShare: "–" });
    expect(e.days).toHaveLength(30);
    expect(e.dayMax).toBe(0);
    expect(e.peak).toBeNull();
    expect(e.daySummary).toContain("none yet");
    expect(e.outcomes.every((o) => o.n === 0 && o.pct === "–" && o.width === 0)).toBe(true);
    expect([e.fit, e.rulesDepend, e.tracks, e.skipped, e.changed, e.feedback]).toEqual([[], [], [], [], [], []]);
  });
});

describe("helpers", () => {
  it("addDays crosses months in UTC", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("niceMax rounds up with a whole midpoint", () => {
    expect([0, 3, 5, 9, 10, 11, 47, 74, 130].map(niceMax)).toEqual([4, 4, 6, 10, 10, 20, 60, 80, 200]);
  });
});

describe("admin queries (lib/db/admin.ts)", () => {
  // The code only, without comments. The dashboard's reads come before the single-response reads (issue #37).
  const all = readFileSync(new URL("../../db/admin.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**"))
    .join("\n");
  const split = all.indexOf("export async function listResponses");
  const code = all.slice(0, split);
  const single = all.slice(split);

  it("single responses: no emails, no feedback, and free text never leaves the database", () => {
    expect(split).toBeGreaterThan(0);
    expect(single).not.toMatch(/\bemail\b|\bresearch_contacts\b|\bfeedback\b|compare_name|edit_token/i);
    expect(single).not.toMatch(/select\s+\*/i);
    // Answers are read only through the filter that drops string (free-text) answers, or counted.
    const filtered = "(select coalesce(jsonb_object_agg(k, a), '{}'::jsonb) from jsonb_each(answers) e(k, a) where jsonb_typeof(a) <> 'string') as answers";
    expect(single).toContain(filtered);
    const rest = single
      .replace(filtered, "")
      .replace("exists (select 1 from jsonb_each(answers) e(k, a) where jsonb_typeof(a) = 'string') as free_text_answered", "")
      .replace("(select count(*) from jsonb_object_keys(answers))::int as answered", "");
    expect(rest).not.toMatch(/\banswers\b/);
  });

  it("read emails only as 'was one given'", () => {
    expect(code.match(/\bemail\b/gi)).toHaveLength(1);
    expect(code).toContain("(email is not null) as has_email");
    expect(code).not.toMatch(/\bresearch_contacts\b/);
  });

  it("never read answers or free text, except to count the unscored CX-T1", () => {
    const cx = "answers -> ${RULES_DEPEND_ITEM}::text";
    expect(code.split(cx).length - 1).toBe(3);
    expect(code.replaceAll(cx, "")).not.toMatch(/\banswers\b/);
    expect(code).not.toMatch(/D9/);
    expect(code).not.toMatch(/select\s+\*/i);
  });
});

// Issue #46: the dashboard read "(1 people)".
describe("counts on the admin pages", () => {
  it("use the singular for one and the plural otherwise", () => {
    expect(countOf(1, "person", "people")).toBe("1 person");
    expect(countOf(0, "person", "people")).toBe("0 people");
    expect(countOf(1204, "person", "people")).toBe("1,204 people");
    expect(plural(1, "completed quiz", "completed quizzes")).toBe("completed quiz");
    expect(plural(2, "completed quiz", "completed quizzes")).toBe("completed quizzes");
    expect(countOf(1, "response", "responses")).toBe("1 response");
  });

  it("are never written as a bare number before a plural noun in the admin pages", () => {
    for (const f of ["app/admin/page.tsx", "app/admin/responses/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/format\([^)]*\)\}? ?(people|responses|quizzes)/);
      expect(src, f).not.toMatch(/note="completed quizzes"/);
    }
  });
});

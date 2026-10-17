// Result page v2 (issues #28 and #37): the result first, the six answers, the
// owner's fit, share and research cards, the rest folded under "Go deeper",
// then "Take the quiz again" (or, for visitors, the invitation to compare) and
// the earlier-version note. The unsaved result needs no database; the owner
// and visitor views of a stored result run only with E2E_DB=1.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { LOCAL_TEST_URL } from "@/scripts/local-db.mjs";
import vectors from "@/reference/test-vectors.json";
import { getCopy } from "@/lib/content/copy";
import { screenCount } from "@/lib/form";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";
import { content, failSaving, openUnsavedResult, settled } from "./helpers";

const copy = getCopy();
const r = copy.results;
const answersOf = (id: string) => vectors.score_cases.find((x) => x.id === id)!.answers;
// Item bank 0.5.0 (issue #31) replaced these statements; older releases know them by the old IDs.
const REPLACED_IN_050: Record<string, string> = {
  "C3-09": "C3-03", "C3-10": "C3-05", "C4-09": "C4-01", "C5-10": "C5-04", "C5-11": "C5-06", "C6-09": "C6-05",
};
const nameOf = (id: string) => content.perspectives.perspectives.find((p) => p.id === id)!.name;

/** A finished quiz in this tab. Seed 4242 draws no quick check. */
async function finished(page: Page, vector: string) {
  const state = { ...newQuiz(4242), index: 999, answers: answersOf(vector), timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
}

async function unsaved(page: Page, vector: string) {
  await finished(page, vector);
  await failSaving(page);
  await page.goto("/result");
  await openUnsavedResult(page);
}

/** Save a vector's answers from a fresh browser, with its own client address for the rate limit. */
async function saved(browser: Browser, vector: string, ip: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "x-forwarded-for": ip } })).newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { va: (...a: unknown[]) => void; events: unknown[] };
    w.events = [];
    w.va = (...a: unknown[]) => void w.events.push(a);
  });
  await finished(page, vector);
  await page.goto("/result");
  await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
  await page.getByRole("heading", { level: 2, name: r.six_answers }).waitFor();
  return page;
}

/** The Go deeper rows' names, in order. */
const ROW = 'main section[aria-labelledby="deeper"] > div > details';
const rowNames = (page: Page) => page.locator(`${ROW} > summary`).allInnerTexts();
/** The text of the page's h1 and h2s, in order. */
const headings = (page: Page) => page.locator("main").getByRole("heading").evaluateAll((hs) => hs.map((h) => `${h.tagName}:${h.textContent}`));

async function audit(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

const sideways = (page: Page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = Array.from(document.querySelectorAll("button, a, h1, h2, summary, header *"))
      .filter((e) => e.getBoundingClientRect().right > w + 1 || e.scrollWidth > e.clientWidth + 1)
      .map((e) => (e.textContent ?? "").trim().slice(0, 40));
    return document.documentElement.scrollWidth > w ? ["(page scrolls sideways)", ...out] : out;
  });

// ---------- Unsaved result: order of sections ----------

const ROWS: Record<string, string[]> = {
  steward: [r.what_stands_out, r.something_to_talk_about, r.elsewhere, r.common_ground, r.you_and_others, r.why],
  skeptic: [r.something_to_talk_about, r.elsewhere, r.common_ground, r.you_and_others, r.why],
  mixed_between: [
    r.what_stands_out,
    r.about_perspective.replace("{perspective}", nameOf("stewards")),
    r.about_perspective.replace("{perspective}", nameOf("pragmatists")),
    r.common_ground,
    r.you_and_others,
    r.why,
  ],
  mixed_unmatched: [r.common_ground, r.you_and_others, r.why],
  undecided_confidence: [r.what_stands_out, r.common_ground, r.you_and_others, r.why],
  indifferent: [r.what_stands_out, r.common_ground, r.you_and_others, r.why],
};

for (const [vector, rows] of Object.entries(ROWS)) {
  test(`unsaved ${vector} result: hero, six answers, Go deeper rows in order and all closed`, async ({ page }) => {
    await unsaved(page, vector);
    const hs = await headings(page);
    expect(hs[0]).toMatch(/^H1:/);
    expect(hs.filter((h) => h.startsWith("H1:"))).toHaveLength(1);
    const six = hs.indexOf(`H2:${r.six_answers}`);
    expect(six).toBeGreaterThan(0);
    expect(hs.at(-1)).toBe(`H2:${r.go_deeper}`);
    await expect(page.getByText(r.six_intro)).toBeVisible();
    await expect(page.getByText(r.go_deeper_intro)).toBeVisible();

    // Only the rows the result has, each one closed.
    const names = await rowNames(page);
    const expected = rows.filter((x) => names.includes(x));
    expect(names.filter((x) => rows.includes(x))).toEqual(expected);
    expect(names.at(-1)).toBe(r.why);
    expect(names).toContain(r.you_and_others);
    expect(await page.locator(`${ROW}[open]`).count()).toBe(0);
    // Unsaved: no owner controls, and no help row.
    expect(names).not.toContain(copy.fit.section_heading);
    await expect(page.getByRole("heading", { name: copy.share.heading })).toHaveCount(0);
    // The early-version note is the last paragraph of the "why" fold, not under the headline (issue #37).
    const why = page.locator(ROW).last();
    await expect(why.getByText(/This is an early version/)).toBeHidden();
    await why.locator("summary").click();
    await expect(why.locator("p").last()).toContainText("This is an early version");
    expect(await page.locator("main > div").first().innerText()).not.toContain("This is an early version");
  });
}

test("Take the quiz again on an unsaved result asks first, on the page", async ({ page }) => {
  page.on("dialog", (d) => {
    throw new Error(`unexpected ${d.type()} dialog`);
  });
  await unsaved(page, "steward");
  const again = page.getByRole("link", { name: copy.result_page.again_link });
  // The last thing in the result, after Go deeper.
  expect((await again.boundingBox())!.y).toBeGreaterThan((await page.getByRole("heading", { name: r.go_deeper }).boundingBox())!.y);
  await again.click();
  await expect(page.getByText(copy.result_page.again_unsaved)).toBeFocused();
  await page.getByRole("button", { name: copy.result_page.again_keep }).click();
  await expect(page.getByText(copy.result_page.again_unsaved)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate((k) => sessionStorage.getItem(k), STORAGE_KEY)).not.toBeNull();

  await again.click();
  await page.getByRole("button", { name: copy.result_page.again_confirm }).click();
  await page.waitForURL(/\/start$/);
  expect(await page.evaluate((k) => sessionStorage.getItem(k), STORAGE_KEY)).toBeNull();
});

test("unsaved matched result: the hero has the description and the objection, and no separate About section", async ({ page }) => {
  await unsaved(page, "steward");
  const p = content.perspectives.perspectives.find((x) => x.id === "stewards")!;
  const hero = page.locator("main > div").first();
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(`${r.closest_label}: ${p.name}`);
  for (const t of [p.tagline, p.description, r.strongest_objection, p.strongest_objection]) await expect(hero.getByText(t, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: r.about_perspective.replace("{perspective}", p.name) })).toHaveCount(0);
  // The discussion prompt is folded under Something to talk about.
  await expect(page.getByText(p.discussion_prompt)).toBeHidden();
  await page.getByText(r.something_to_talk_about, { exact: true }).click();
  await expect(page.getByText(p.discussion_prompt)).toBeVisible();
});

// "Elsewhere you might hear" (issue #39): its own row after "Something to talk
// about" on a matched result, and the last item in each "About" row when in between.
// Never on the landing cards (prediction.spec.ts) or the share image.
const elsewhere = (id: string) => content.perspectives.perspectives.find((p) => p.id === id)!.elsewhere!.replace(/\*/g, "");

test("Go deeper on a matched result: Elsewhere you might hear, after Something to talk about", async ({ page }) => {
  await unsaved(page, "skeptic");
  const row = page.locator(ROW).filter({ has: page.locator("summary", { hasText: r.elsewhere }) });
  await row.locator("summary").click();
  await expect(row).toContainText(elsewhere("skeptics"));
});

test("Go deeper in between: Elsewhere you might hear is the last item about each perspective", async ({ page }) => {
  await unsaved(page, "mixed_between");
  const pair = vectors.score_cases.find((v) => v.id === "mixed_between")!.expected.outcome.ranked.slice(0, 2).map((x) => x.id);
  for (const id of pair) {
    const about = page.locator(ROW).filter({ has: page.locator("summary", { hasText: r.about_perspective.replace("{perspective}", nameOf(id)) }) });
    await about.locator("summary").click();
    const items = about.locator(":scope > div > div");
    await expect(items.last().locator("span")).toHaveText(r.elsewhere);
    await expect(items.last().locator("p")).toHaveText(elsewhere(id));
  }
});

test("opening a Go deeper row is counted once per page view", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { va: (...a: unknown[]) => void; events: unknown[] };
    w.events = [];
    w.va = (...a: unknown[]) => void w.events.push(a);
  });
  await unsaved(page, "steward");
  const opened = () =>
    page.evaluate(() =>
      (window as unknown as { events: [string, { name?: string; data?: { section: string } }][] }).events
        .filter(([kind, e]) => kind === "event" && e.name === "result_section_opened")
        .map(([, e]) => e.data?.section),
    );
  const row = page.getByText(r.common_ground, { exact: true });
  await row.click();
  await row.click();
  await row.click();
  await page.getByText(r.why, { exact: true }).click();
  await expect.poll(opened).toEqual(["common_ground", "why"]);
});

for (const scheme of ["light", "dark"] as const) {
  for (const width of [390, 320]) {
    test(`axe on the unsaved result with rows closed and open (${scheme}, ${width}px)`, async ({ browser }) => {
      const page = await (await browser.newContext({ colorScheme: scheme, viewport: { width, height: 844 } })).newPage();
      if (width === 320) {
        await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
      }
      await unsaved(page, "mixed_between");
      await audit(page);
      for (const s of await page.locator(`${ROW} > summary`).all()) await s.click();
      expect(await page.locator(`${ROW}:not([open])`).count()).toBe(0);
      await audit(page);
      if (width === 320) expect(await sideways(page)).toEqual([]);
      await page.screenshot({ path: `test-results/result-v2-between-${scheme}-${width}.png`, fullPage: true });
    });
  }
}

// ---------- Stored result: owner and visitor ----------

test.describe("stored", () => {
  test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");

  test("a matched owner: headline and the start of the six answers on screen, then fit, share, research, Go deeper, take it again", async ({
    browser,
  }) => {
    const page = await saved(browser, "steward", "203.0.113.41");
    // At 390×844, without scrolling (issue #37; Share now comes after the fit questions).
    for (const l of [page.getByRole("heading", { level: 1 }), page.getByRole("heading", { level: 2, name: r.six_answers })]) {
      const box = (await l.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    await page.screenshot({ path: "test-results/result-v2-owner-steward.png", fullPage: true });

    expect(await headings(page)).toEqual([
      `H1:${r.closest_label}${nameOf("stewards")}`,
      `H2:${r.six_answers}`,
      `H2:${copy.fit.heading}`,
      `H2:${copy.share.heading}`,
      `H2:${copy.research_consent.heading}`,
      `H2:${r.go_deeper}`,
    ]);
    expect(await rowNames(page)).toEqual([
      r.what_stands_out,
      r.something_to_talk_about,
      r.elsewhere,
      r.common_ground,
      r.you_and_others,
      copy.fit.section_heading,
      r.why,
    ]);
    expect(await page.locator(`${ROW}[open]`).count()).toBe(0);
    // Compare is offered from the shared link now, not from its own section with a name.
    await expect(page.getByRole("button", { name: copy.compare.heading })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /first name/i })).toHaveCount(0);
    // No quick check here, so no note; and no visitor invitation for the owner.
    await expect(page.getByText(/^Before your result, you rated/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: copy.result_page.compare_button })).toHaveCount(0);
    await expect(page.getByText(copy.result_page.shared_anonymous)).toHaveCount(0);
    // The owner's subhead keeps "You are also near".
    await expect(page.getByText(/You are also near/)).toBeVisible();
    // Take the quiz again, last, after Go deeper.
    const again = page.getByRole("link", { name: copy.result_page.again_link });
    expect((await again.boundingBox())!.y).toBeGreaterThan((await page.getByRole("heading", { name: r.go_deeper }).boundingBox())!.y);
  });

  test("Take the quiz again on a saved result goes straight to the start", async ({ browser }) => {
    const page = await saved(browser, "steward", "203.0.113.47");
    const path = new URL(page.url()).pathname;
    page.on("dialog", (d) => {
      throw new Error(`unexpected ${d.type()} dialog`);
    });
    // A leftover link from a shared result is cleared too: this is a fresh start.
    await page.evaluate(() => sessionStorage.setItem("fmaw-compare-with", "zzzzzzzzzzzzzz"));
    await page.getByRole("link", { name: copy.result_page.again_link }).click();
    await page.waitForURL(/\/start$/);
    expect(await page.evaluate(() => sessionStorage.getItem("fmaw-compare-with"))).toBeNull();
    // The result stays at its link.
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2, name: r.six_answers })).toBeVisible();
  });

  test("the fit card saves with one tap, and the help row then asks which fits better", async ({ browser }) => {
    const page = await saved(browser, "steward", "203.0.113.43");
    const fit = page.getByRole("group", { name: copy.fit.heading });
    await expect(page.getByText(copy.fit.quick_note)).toBeVisible();
    await fit.getByRole("button", { name: "A little" }).click();
    await expect(page.getByRole("status").filter({ hasText: copy.fit.quick_thanks })).toBeVisible();
    await expect(fit.getByRole("button", { name: "A little" })).toHaveAttribute("aria-pressed", "true");
    await page.getByText(copy.fit.section_heading, { exact: true }).click();
    await expect(page.getByRole("group", { name: copy.fit.better_heading })).toBeVisible();
    // The fit question isn't asked twice.
    await expect(page.getByRole("group", { name: copy.fit.heading })).toHaveCount(1);
  });

  for (const vector of ["steward", "mixed_between", "all_neither_settled"]) {
    test(`a visitor to a ${vector} result: invited to compare at the top and the end, and only the result, six answers and Go deeper`, async ({
      browser,
    }) => {
      const owner = await saved(browser, vector, `203.0.113.${50 + vector.length}`);
      const visitor = await (await browser.newContext({ viewport: { width: 390, height: 660 } })).newPage();
      await visitor.goto(new URL(owner.url()).pathname);
      await visitor.getByRole("heading", { level: 2, name: r.six_answers }).waitFor();
      await visitor.screenshot({ path: `test-results/result-v2-visitor-${vector}.png`, fullPage: true });

      const boxes = visitor.getByRole("region", { name: copy.result_page.take_it_heading });
      await expect(boxes).toHaveCount(2);
      const body = copy.result_page.compare_body.replace("{n}", String(screenCount(content)));
      for (const b of await boxes.all()) {
        await expect(b.getByText(body)).toBeVisible();
        await expect(b.getByRole("button", { name: copy.result_page.compare_button })).toBeVisible();
      }
      // The top box: under the banner, above the result, and its button on screen without scrolling at 390×660.
      const y = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!.y;
      const top = boxes.first();
      expect(await y(top)).toBeGreaterThan(await y(visitor.getByText(copy.result_page.shared_anonymous)));
      expect(await y(top)).toBeLessThan(await y(visitor.getByRole("heading", { level: 1 })));
      const button = (await top.getByRole("button").boundingBox())!;
      expect(button.y + button.height).toBeLessThanOrEqual(660);
      // The end box comes after Go deeper.
      expect(await y(boxes.last())).toBeGreaterThan(await y(visitor.getByRole("heading", { name: r.go_deeper })));

      await expect(visitor.getByText(r.six_intro)).toBeVisible();
      for (const name of [copy.share.heading, copy.fit.heading, copy.research_consent.heading]) {
        await expect(visitor.getByRole("heading", { name })).toHaveCount(0);
      }
      await expect(visitor.getByRole("button", { name: copy.compare.heading })).toHaveCount(0);
      await expect(visitor.getByRole("link", { name: copy.result_page.again_link })).toHaveCount(0);
      await expect(visitor.getByText(/Something off\?/)).toHaveCount(0);
      const names = await rowNames(visitor);
      expect(names).not.toContain(copy.fit.section_heading);
      expect(names).toContain(r.you_and_others);
      expect(names.at(-1)).toBe(r.why);
      // One wording for everyone (issue #37): the visitor reads the result as written for its owner.
      expect(await visitor.getByRole("heading", { level: 1 }).innerText()).toBe(await owner.getByRole("heading", { level: 1 }).innerText());
      await audit(visitor);
      await visitor.context().close();
    });
  }

  test("on a phone, the compare bar appears once the top box scrolls away and hides at the end box", async ({ browser }) => {
    const owner = await saved(browser, "steward", "203.0.113.48");
    const visitor = await (await browser.newContext({ viewport: { width: 390, height: 660 } })).newPage();
    await visitor.goto(new URL(owner.url()).pathname);
    const bar = visitor.getByTestId("compare-bar");
    const barButton = bar.getByRole("button", { name: copy.result_page.compare_button });
    await visitor.getByRole("heading", { level: 2, name: r.six_answers }).waitFor();
    await expect(barButton).toBeHidden();

    await visitor.getByRole("heading", { level: 2, name: r.six_answers }).scrollIntoViewIfNeeded();
    await visitor.evaluate(() => window.scrollBy(0, 200));
    await expect(barButton).toBeVisible();
    const height = (await bar.boundingBox())!.height;
    expect(await visitor.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom))).toBeCloseTo(height, 0);
    await audit(visitor);

    await visitor.getByRole("region", { name: copy.result_page.take_it_heading }).last().scrollIntoViewIfNeeded();
    await expect(barButton).toBeHidden();
    await visitor.evaluate(() => window.scrollTo(0, 0));
    await expect(barButton).toBeHidden();

    // Never on wider screens.
    await visitor.setViewportSize({ width: 1024, height: 700 });
    await visitor.getByRole("heading", { level: 2, name: r.six_answers }).scrollIntoViewIfNeeded();
    await expect(bar).toBeHidden();
    await visitor.context().close();
  });

  test("with reduced motion, the compare bar doesn't animate", async ({ browser }) => {
    const owner = await saved(browser, "steward", "203.0.113.49");
    const visitor = await (await browser.newContext({ viewport: { width: 390, height: 660 }, reducedMotion: "reduce" })).newPage();
    await visitor.goto(new URL(owner.url()).pathname);
    const bar = visitor.getByTestId("compare-bar");
    // globals.css shortens every transition to next to nothing under reduced motion.
    expect(parseFloat(await bar.evaluate((e) => getComputedStyle(e).transitionDuration))).toBeLessThan(0.01);
    await visitor.context().close();
  });

  test("the share images are served at both sizes for every outcome", async ({ browser, request }) => {
    const vectorsToSave = ["steward", "skeptic", "mixed_between", "mixed_unmatched", "undecided_confidence", "undecided_coverage", "all_neither_settled", "indifferent"];
    for (const [i, vector] of vectorsToSave.entries()) {
      const page = await saved(browser, vector, `203.0.113.${60 + i}`);
      const path = new URL(page.url()).pathname;
      for (const url of [`${path}/image`, `${path}/opengraph-image`]) {
        const res = await request.get(url);
        expect(res.status(), `${vector} ${url}`).toBe(200);
        expect(res.headers()["content-type"], url).toBe("image/png");
      }
      await page.context().close();
    }
  });

  test("the share images are served for a result from a frozen release (no summaries)", async ({ browser, request }) => {
    // The database the test server saves to (playwright.config.ts).
    const sql = postgres(process.env.E2E_DATABASE_URL || LOCAL_TEST_URL, { max: 1, prepare: false });
    try {
      for (const [i, vector] of ["steward", "mixed_between"].entries()) {
        const page = await saved(browser, vector, `203.0.113.${90 + i}`);
        const path = new URL(page.url()).pathname;
        const id = path.split("/").pop()!;
        // The last release before taxonomy 0.2.1, frozen in lib/content/releases.
        // Its statements had the IDs that item bank 0.5.0 replaced.
        const [row] = await sql<{ answers: object; result: object }[]>`select answers, result from responses where id = ${id}`;
        const toOld = (x: object) => JSON.parse(JSON.stringify(x).replace(/"(C\d-\d\d)"/g, (m, k: string) => `"${REPLACED_IN_050[k] ?? k}"`));
        // That release had six perspectives: Skeptics came in taxonomy 0.3.0.
        type Ref = { perspective: string };
        const result = toOld(row.result) as {
          outcome: { ranked: { id: string }[] };
          statements: { common_ground: Ref[]; differences: Ref[]; unexpected: Ref | null };
        };
        const six = (x: Ref) => x.perspective !== "skeptics";
        result.outcome.ranked = result.outcome.ranked.filter((x) => x.id !== "skeptics");
        result.statements.common_ground = result.statements.common_ground.filter(six);
        result.statements.differences = result.statements.differences.filter(six);
        if (result.statements.unexpected && !six(result.statements.unexpected)) result.statements.unexpected = null;
        await sql`update responses set answers = ${sql.json(toOld(row.answers))}, result = ${sql.json(result)}, scoring_version = '0.3.0', taxonomy_version = '0.2.0', item_bank_version = '0.4.1', narratives_version = '0.5.0' where id = ${id}`;
        await page.reload();
        await expect(page.getByText(copy.result_page.old_version.split(".")[0])).toBeVisible();
        for (const url of [`${path}/image`, `${path}/opengraph-image`]) {
          const res = await request.get(url);
          expect(res.status(), `${vector} ${url}`).toBe(200);
        }
        await page.context().close();
      }
    } finally {
      await sql.end();
    }
  });
});

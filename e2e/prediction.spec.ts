// The landing page's perspectives and the optional guess before the result
// (issues #24 and #37). Saving is mocked; the test at the bottom needs a
// database and runs only with E2E_DB=1.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { getCopy } from "@/lib/content/copy";
import { screenCount } from "@/lib/form";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";
import { PREDICTION_HEADING, content, failSaving, settled } from "./helpers";

const copy = getCopy();
const perspectives = content.perspectives.perspectives;
const steward = vectors.score_cases.find((x) => x.id === "steward")!.answers;

async function audit(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

/** A finished quiz that hasn't been asked for a guess yet. Seed 4242 draws no quick check; 34 does. */
async function finished(page: Page, seed = 4242) {
  const state = { ...newQuiz(seed), index: 999, answers: steward, timings: { "C1-01": 90_000 }, finished: true };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
}

/** Capture what the finished quiz posts, and fail the save so the unsaved result can be opened. */
async function capture(page: Page) {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/responses", async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, body: "{}" });
  });
  return posts;
}

const sideways = (page: Page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = Array.from(document.querySelectorAll("button, a, h1, h2, h3, li, select, p"))
      .filter((e) => e.getBoundingClientRect().right > w + 1)
      .map((e) => (e.textContent ?? "").trim().slice(0, 40));
    return document.documentElement.scrollWidth > w ? ["(page scrolls sideways)", ...out] : out;
  });

async function bigText(browser: Browser) {
  const page = await (await browser.newContext({ viewport: { width: 320, height: 700 } })).newPage();
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
  return page;
}

// ---------- Landing ----------

test("the landing page shows the perspectives as equal cards, with a start button before and after", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.getByText("What you'll get")).toHaveCount(0);
  for (const fact of copy.landing.facts) {
    const text = fact.replace("{n}", String(screenCount(content)));
    await expect(page.getByRole("listitem").filter({ hasText: new RegExp(`^·?\\s*${text}$`) })).toBeVisible();
  }
  // One question count everywhere (issue #37).
  await expect(page.getByText(`${screenCount(content)} quick questions`, { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("about 50");

  const section = page.getByRole("region", { name: copy.landing.perspectives_heading });
  await expect(section.getByRole("heading", { level: 3 })).toHaveText(perspectives.map((p) => p.name));
  for (const p of perspectives) await expect(section.getByText(p.tagline, { exact: true })).toBeVisible();
  await expect(section.getByText(copy.landing.perspectives_note)).toBeVisible();

  // Same size for every card.
  const boxes = await section.getByRole("listitem").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.width, r.height]));
  expect(new Set(boxes.map(([w]) => Math.round(w))).size).toBe(1);
  expect(new Set(boxes.map(([, h]) => Math.round(h))).size).toBe(1);
  // With an odd count the last card sits alone at the left of its row, not stretched or centred (issue #39).
  const lefts = await section.getByRole("listitem").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(lefts.at(-1)).toBe(lefts[0]);
  // The outside names stay off the landing cards.
  await expect(section.getByText(copy.results.elsewhere)).toHaveCount(0);
  for (const p of perspectives) await expect(section).not.toContainText(p.elsewhere!.replace(/\*/g, ""));

  await expect(page.getByRole("link", { name: copy.landing.start_button, exact: true })).toHaveAttribute("href", "/start");
  await expect(section.getByRole("link", { name: copy.landing.second_start_button })).toHaveAttribute("href", "/start");
  await expect(page.getByRole("link", { name: "How this works" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy" }).first()).toBeVisible();
});

test("on a phone the cards stack one per row; at 320px with 200% text nothing scrolls sideways", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const xs = await page
    .getByRole("region", { name: copy.landing.perspectives_heading })
    .getByRole("listitem")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size).toBe(1);

  const big = await bigText(browser);
  await big.goto("/");
  expect(await sideways(big)).toEqual([]);
  await failSaving(big);
  await finished(big);
  await big.goto("/result");
  await big.getByRole("heading", { name: PREDICTION_HEADING }).waitFor();
  await big.getByRole("button", { name: /^Stewards/ }).click();
  await big.getByRole("button", { name: /^Pragmatists/ }).click();
  expect(await sideways(big)).toEqual([]);
});

// ---------- The guess ----------

test("the guess comes before the result, takes focus, and says it won't change the result", async ({ page }) => {
  await finished(page);
  const posts = await capture(page);
  await page.goto("/result");
  await expect(page.getByRole("heading", { level: 1, name: PREDICTION_HEADING })).toBeFocused();
  await expect(page.getByText(copy.prediction.body)).toBeVisible();
  // Nothing is saved, and no result shown, until the person guesses or skips.
  await expect(page.getByRole("heading", { name: "Your six answers" })).toHaveCount(0);
  expect(posts).toHaveLength(0);
  // Every named perspective and every broad outcome can be guessed.
  for (const p of perspectives) await expect(page.getByRole("button", { name: new RegExp(`^${p.name}`) })).toBeVisible();
  for (const label of Object.values(copy.prediction.options)) await expect(page.getByRole("button", { name: label })).toBeVisible();
  await expect(page.getByRole("button", { name: copy.prediction.submit, exact: true })).toBeDisabled();

  await page.getByRole("button", { name: /^Accelerators/ }).click();
  await expect(page.getByRole("button", { name: /^Accelerators/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: copy.prediction.submit, exact: true }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(posts[0]).toMatchObject({ prediction: { kind: "perspective", perspectives: ["accelerators"] } });

  // The result sets the guess beside it, without right or wrong.
  await page.getByRole("button", { name: "See my result without saving" }).click();
  const reflection = page.getByRole("region", { name: copy.reflection.heading });
  await expect(reflection).toContainText("You expected Accelerators. Your answers landed closest to Stewards.");
  await expect(reflection).toContainText(copy.reflection.prompt);
  await expect(reflection).not.toContainText(/correct|wrong|accurate/i);
  await expect(page.locator("[role=alert], [aria-live]").filter({ hasText: "You expected" })).toHaveCount(0);
  await audit(page);
});

test("tap one perspective, or two for between; a third replaces the oldest, and the other outcomes clear them", async ({ page }) => {
  await finished(page);
  const posts = await capture(page);
  await page.goto("/result");
  const card = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });
  const group = page.getByRole("group", { name: copy.prediction.group_label });
  const hint = page.getByText(/of 2 picked$/);
  await expect(group.getByRole("button")).toHaveCount(perspectives.length + 3);
  await expect(page.getByRole("button", { name: "Between two perspectives" })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);

  await card("Stewards").click();
  await expect(hint).toHaveText(copy.prediction.picked.replace("{n}", "1"));
  await card("Pragmatists").click();
  await expect(hint).toHaveText(copy.prediction.picked.replace("{n}", "2"));
  await expect(group).toHaveAccessibleDescription(copy.prediction.picked.replace("{n}", "2"));
  await expect(hint).toHaveAttribute("aria-live", "polite");
  // A third replaces the older of the two.
  await card("Accelerators").click();
  await expect(card("Stewards")).toHaveAttribute("aria-pressed", "false");
  await expect(card("Pragmatists")).toHaveAttribute("aria-pressed", "true");
  await expect(card("Accelerators")).toHaveAttribute("aria-pressed", "true");
  // Tapping a picked card unpicks it.
  await card("Accelerators").click();
  await expect(card("Accelerators")).toHaveAttribute("aria-pressed", "false");
  await card("Accelerators").click();

  // A broad outcome clears the cards; a card clears the broad outcome.
  const forming = page.getByRole("button", { name: copy.prediction.options.forming });
  await forming.click();
  await expect(forming).toHaveAttribute("aria-pressed", "true");
  for (const p of perspectives) await expect(card(p.name)).toHaveAttribute("aria-pressed", "false");
  await card("Stewards").click();
  await expect(forming).toHaveAttribute("aria-pressed", "false");
  await card("Accelerators").click();
  await audit(page);

  await page.getByRole("button", { name: copy.prediction.submit, exact: true }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(posts[0]).toMatchObject({ prediction: { kind: "between", perspectives: ["stewards", "accelerators"] } });
});

test("at 390×660 the guess buttons stay on screen while the cards scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await finished(page);
  await failSaving(page);
  await page.goto("/result");
  await page.getByRole("heading", { name: PREDICTION_HEADING }).waitFor();
  for (const at of ["top", "bottom"] as const) {
    if (at === "bottom") await page.mouse.wheel(0, 400);
    for (const name of [copy.prediction.submit, copy.prediction.skip]) {
      const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(box.y, `${name} at the ${at}`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${name} at the ${at}`).toBeLessThanOrEqual(660);
    }
  }
});

test("skipping the guess is recorded as a skip, and the result has no reflection", async ({ page }) => {
  await finished(page);
  const posts = await capture(page);
  await page.goto("/result");
  await page.getByRole("button", { name: copy.prediction.skip }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(posts[0]).toMatchObject({ prediction: { kind: "skipped" } });
  await page.getByRole("button", { name: "See my result without saving" }).click();
  await expect(page.getByRole("heading", { name: "Your six answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.reflection.heading })).toHaveCount(0);
});

test("people in the quick check skip the guess, so nobody sees both (issue #37)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await finished(page, 34);
  const posts = await capture(page);
  await page.goto("/result");
  await expect(page.getByRole("heading", { name: copy.quick_check.heading })).toBeVisible();
  await expect(page.getByRole("heading", { name: PREDICTION_HEADING })).toHaveCount(0);
  // Shorter and explained: the intro, and the short summary instead of the full description.
  await expect(page.getByText(copy.quick_check.intro)).toBeVisible();
  const summaries = await Promise.all(perspectives.map((p) => page.getByText(p.card_summary, { exact: true }).count()));
  expect(summaries.reduce((a, b) => a + b, 0)).toBe(1);
  for (const p of perspectives) await expect(page.getByText(p.description, { exact: true })).toHaveCount(0);
  // Fits at 390×660: the last rating is on screen without scrolling.
  const last = (await page.getByRole("button", { name: copy.quick_check.options[4] }).boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(660);
  await audit(page);

  await page.getByRole("button", { name: copy.quick_check.options[3] }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // The guess was never shown, so it is stored as not shown (null), not as a skip.
  expect(posts[0]).toMatchObject({ prediction: null, quick_check: { rating: 4 } });
});

test("the guess works with the keyboard alone", async ({ page }) => {
  await finished(page);
  await failSaving(page);
  await page.goto("/result");
  await expect(page.getByRole("heading", { name: PREDICTION_HEADING })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: new RegExp(`^${perspectives[0].name}`) })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: new RegExp(`^${perspectives[0].name}`) })).toHaveAttribute("aria-pressed", "true");
  const submit = page.getByRole("button", { name: copy.prediction.submit, exact: true });
  for (let i = 0; i < 20 && !(await submit.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`the guess passes axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await finished(page);
    await failSaving(page);
    await page.goto("/result");
    await page.getByRole("heading", { name: PREDICTION_HEADING }).waitFor();
    await audit(page);
    await page.getByRole("button", { name: /^Stewards/ }).click();
    await page.getByRole("button", { name: /^Pragmatists/ }).click();
    await audit(page);
  });
}

// ---------- Stored ----------

test("a saved guess shows to the owner only, and never on the public page", async ({ browser, request }) => {
  test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");
  // Its own client address, so this save doesn't use up the other tests' rate limit.
  const page = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.24" } })).newPage();
  await finished(page);
  await page.goto("/result");
  await page.getByRole("button", { name: /^Accelerators/ }).click();
  await page.getByRole("button", { name: copy.prediction.submit, exact: true }).click();
  await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
  const path = new URL(page.url()).pathname;

  const reflection = page.getByRole("region", { name: copy.reflection.heading });
  await expect(reflection).toContainText("You expected Accelerators. Your answers landed closest to Stewards.");
  // Right under the result, before the six answers (issue #37: share moved below the fit questions).
  const y = async (l: import("@playwright/test").Locator) => (await l.boundingBox())!.y;
  expect(await y(reflection)).toBeGreaterThan(await y(page.getByRole("heading", { level: 1 })));
  expect(await y(reflection)).toBeLessThan(await y(page.getByRole("heading", { name: copy.results.six_answers })));

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(path);
  await expect(visitor.getByRole("heading", { name: "Your six answers" })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: copy.reflection.heading })).toHaveCount(0);
  for (const url of [path, `${path}/image`]) {
    const body = await (await request.get(url)).text();
    expect(body).not.toMatch(/prediction|You expected/);
  }
});

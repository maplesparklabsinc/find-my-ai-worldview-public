import { expect, test } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { STORAGE_KEY } from "@/lib/quiz";
import { PREDICTION_HEADING, QUIZ, content, failSaving, openQuizAt, openUnsavedResult, seedFor } from "./helpers";
import { newQuiz } from "@/lib/quiz";

test("landing to result, answering everything, on a phone", QUIZ, async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const seed = seedFor("agree_first");
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, v);
    },
    [STORAGE_KEY, JSON.stringify(newQuiz(seed))] as const,
  );
  await failSaving(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Start", exact: true }).click();
  await page.getByRole("link", { name: "Let's go" }).click();

  for (let n = 1; n <= 51; n++) {
    await expect(page.getByText(`Question ${n} of 51`)).toBeVisible();
    const stem = (await page.getByRole("heading", { level: 1 }).textContent())!;
    const item = content.items.items.find((i) => i.stem === stem)!;
    const group = page.getByRole("group").first();
    if (item.format === "L7" || item.format === "SC" || item.format === "CAT") {
      await group.getByRole("button").first().click();
    } else if (item.format === "TO") {
      await group.getByRole("button").first().click();
      await page.getByRole("button", { name: "Strongly" }).click();
      await page.getByRole("button", { name: "Next" }).click();
    } else if (item.format === "GRID") {
      // One row at a time; each pick moves on to the next row by itself.
      for (let r = 0; r < item.rows.length; r++) {
        await expect(page.getByText(`${r + 1} of ${item.rows.length}`)).toBeVisible();
        await page.getByRole("group").first().getByRole("button").nth(1).click();
      }
    } else {
      await page.getByRole("textbox").fill("Curious and a bit cautious");
      await page.getByRole("button", { name: "See my result" }).click();
    }
  }

  await expect(page).toHaveURL(/\/result$/);
  // The guess comes after the last answer and before the result (issue #24).
  await expect(page.getByRole("heading", { level: 1, name: PREDICTION_HEADING })).toBeFocused();
  await page.getByRole("button", { name: /^Stewards/ }).click();
  await page.getByRole("button", { name: "See my result", exact: true }).click();
  await openUnsavedResult(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your guess" })).toBeVisible();
  await expect(page.getByText("This result isn't saved", { exact: false })).toBeVisible();
  // Agree-first and always tapping the top option: agree with every statement.
  const stored = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!), STORAGE_KEY);
  expect(stored.answers["C1-01"]).toBe(7);
  expect(stored.prediction).toEqual({ kind: "perspective", perspectives: ["stewards"] });
  expect(stored.answers["D3:C1"]).toBe(0);
  expect(Object.keys(stored.timings).length).toBeGreaterThan(40);

  // A refresh keeps the answers and tries to save again.
  await page.reload();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("back keeps earlier answers and skip leaves a question unanswered", QUIZ, async ({ page }) => {
  await page.goto("/quiz");
  const options = page.getByRole("group").first().getByRole("button");
  await options.nth(2).click();
  await expect(page.getByText("Question 2 of 51")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("Question 3 of 51")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Question 1 of 51")).toBeVisible();
  await expect(options.nth(2)).toHaveAttribute("aria-pressed", "true");
});

// Issue #80: the four countries with published polls, inside a sweep of regions.
test("where you live: the eleven options in order, as the usual list, and the answer is kept", QUIZ, async ({ page }) => {
  await openQuizAt(page, seedFor("disagree_first"), "D11");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Where do you currently live?");
  const options = page.getByRole("group").getByRole("button");
  await expect(options).toHaveText([
    "Canada",
    "United States",
    "Latin America",
    "United Kingdom",
    "Elsewhere in Europe",
    "Middle East",
    "Africa",
    "South Asia",
    "East and Southeast Asia",
    "Australia or New Zealand",
    "Somewhere else",
  ]);
  const boxes = await Promise.all((await options.all()).map((o) => o.boundingBox()));
  for (const [i, b] of boxes.entries()) if (i > 0) expect(b!.y).toBeGreaterThan(boxes[i - 1]!.y);
  await options.getByText("South Asia", { exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Where do you currently live?");
  const stored = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!), STORAGE_KEY);
  expect(stored.answers.D11).toBe(7);
});

test("larger text makes the statement bigger and is remembered", QUIZ, async ({ page }) => {
  await page.goto("/quiz");
  const h1 = page.getByRole("heading", { level: 1 });
  const before = await h1.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.getByRole("button", { name: "Larger text" }).click();
  const after = await h1.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(after / before).toBeCloseTo(1.2, 1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Larger text" })).toHaveAttribute("aria-pressed", "true");
});

test("trust grid: one row at a time, answered rows listed with Change", QUIZ, async ({ page }) => {
  await openQuizAt(page, seedFor("disagree_first"), "D4");
  const rows = content.itemsById.get("D4")!.rows;
  await expect(page.getByText(rows[0], { exact: true })).toBeVisible();
  await page.getByRole("group").first().getByRole("button", { name: "Not much" }).click();
  await expect(page.getByText(`2 of ${rows.length}`)).toBeVisible();
  const change = page.getByRole("button", { name: new RegExp(`^${rows[0]}`) });
  await expect(change).toContainText("Not much · Change");
  await change.click();
  await expect(page.getByText(`1 of ${rows.length}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Not much" })).toHaveAttribute("aria-pressed", "true");
  // Still one question in the count.
  const n = Number((await page.getByText(/^Question \d+ of 51$/).textContent())!.match(/\d+/)![0]);
  // Re-confirming row 1 moves on to the next unanswered row.
  await page.getByRole("button", { name: "Not much" }).click();
  for (let r = 1; r < rows.length; r++) {
    await expect(page.getByText(`${r + 1} of ${rows.length}`)).toBeVisible();
    await page.getByRole("group").first().getByRole("button", { name: "Some" }).click();
  }
  await expect(page.getByText(`Question ${n + 1} of 51`)).toBeVisible();
});

test("free text is optional, limited to 280 characters, and never shown on the result", QUIZ, async ({ page }) => {
  await openQuizAt(page, seedFor("disagree_first"), "D9");
  await expect(page.getByText("Optional. Please leave out names and contact details.")).toBeVisible();
  const box = page.getByRole("textbox");
  await expect(box).toHaveAttribute("maxlength", "280");
  await box.fill("My secret words");
  await failSaving(page);
  await page.getByRole("button", { name: "See my result" }).click();
  await expect(page).toHaveURL(/\/result$/);
  await openUnsavedResult(page);
  await expect(page.getByText("My secret words")).toHaveCount(0);
});

test("the finished quiz is posted for saving, with the quick check when drawn", QUIZ, async ({ page }) => {
  // Seed 34 draws the quick check (lib/quickcheck); nothing is compared.
  const answers = vectors.score_cases.find((x) => x.id === "steward")!.answers;
  const state = { ...newQuiz(34), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/responses", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ status: 503, body: "{}" });
  });
  await page.goto("/result");
  await page.getByRole("heading", { name: "One quick thing before your result" }).waitFor();
  await page.getByRole("button", { name: "Very well" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(posted).toMatchObject({ seed: 34, answers, quick_check: { rating: 4 }, compared_with: null });
  expect(posted).not.toHaveProperty("result");
});

// Needs a database: E2E_DB=1 npm run e2e (the local fmaw_test database, or E2E_DATABASE_URL).
test("saves to the database and opens the result page", QUIZ, async ({ page }) => {
  test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");
  const answers = { "C1-01": 6, "C1-02": 6, "C1-04": 6, "C2-01": 2, "C2-03": 2, "C2-04": 2, D11: 0 };
  const state = { ...newQuiz(5), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
  await page.goto("/result");
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9]{14}$/);
  await expect(page.getByRole("heading", { name: "Your six answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Share your result" })).toBeVisible();
  await expect(page.getByText("Help us get this right", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Does this fit you?" })).toBeVisible();
});

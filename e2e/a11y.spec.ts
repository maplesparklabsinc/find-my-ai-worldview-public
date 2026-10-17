import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import type { Answers } from "@/lib/scoring";
import { STORAGE_KEY, goTo, newQuiz } from "@/lib/quiz";
import { standardSequence } from "@/lib/form";
import { QUIZ, content, failSaving, openQuizAt, openUnsavedResult, seedFor, settled } from "./helpers";

async function audit(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  // The quiz set has the light theme; the dark theme and What's changed run with the rest.
  const quiz = scheme === "light" ? QUIZ : {};
  test.describe(`axe (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    for (const path of ["/", "/start", "/how-it-works", "/privacy", "/changes", "/feedback"]) {
      test(path, path === "/changes" ? {} : quiz, async ({ page }) => {
        await page.goto(path);
        await audit(page);
      });
    }

    for (const key of ["C5-05", "S1", "D3:C1", "C3-T1", "D11", "D4", "D9"]) {
      test(`quiz at ${key}`, quiz, async ({ page }) => {
        await openQuizAt(page, seedFor("disagree_first"), key);
        await audit(page);
      });
    }

    // One result page per outcome type, from the reference vectors.
    for (const id of ["steward", "mixed_between", "mixed_unmatched", "undecided_confidence", "undecided_coverage", "indifferent"]) {
      test(`result: ${id}`, quiz, async ({ page }) => {
        const v = vectors.score_cases.find((x) => x.id === id)!;
        const steps = standardSequence(content, 5).steps;
        const s = { ...goTo({ ...newQuiz(5), answers: v.answers as Answers }, steps.length, steps.length), prediction: { kind: "skipped" } };
        await page.addInitScript(([k, val]) => sessionStorage.setItem(k, val), [STORAGE_KEY, JSON.stringify(s)] as const);
        await failSaving(page);
        await page.goto("/result");
        await openUnsavedResult(page);
        // Every outcome carries the "early version" note, linking to What's changed, at the end of the "why" fold (issue #37).
        await page.getByText("Why did I get this?", { exact: true }).click();
        await expect(page.getByText("This is an early version.", { exact: false })).toBeVisible();
        await expect(page.getByRole("link", { name: "what changed" })).toHaveAttribute("href", "/changes");
        await audit(page);
      });
    }

    test("quick check and save failed", quiz, async ({ page }) => {
      const steps = standardSequence(content, 34).steps;
      const v = vectors.score_cases.find((x) => x.id === "steward")!;
      const s = { ...goTo({ ...newQuiz(34), answers: v.answers as Answers }, steps.length, steps.length), prediction: { kind: "skipped" } };
      await page.addInitScript(([k, val]) => sessionStorage.setItem(k, val), [STORAGE_KEY, JSON.stringify(s)] as const);
      await failSaving(page);
      await page.goto("/result");
      await page.getByRole("heading", { name: "One quick thing before your result" }).waitFor();
      await audit(page);
      await page.getByRole("button", { name: "Somewhat" }).click();
      await page.getByRole("button", { name: "Try again" }).waitFor();
      await audit(page);
    });
  });
}

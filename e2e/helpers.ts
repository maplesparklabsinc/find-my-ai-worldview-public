import type { Page } from "@playwright/test";
import { getContent } from "@/lib/content";
import { standardSequence, type AnswerDirection } from "@/lib/form";
import { STORAGE_KEY, newQuiz, type QuizState } from "@/lib/quiz";

export const content = getContent();

/** The quiz set: what a visitor hits. CI runs it on every PR as the fast first signal (`--grep @quiz`). */
export const QUIZ = { tag: "@quiz" };

export const PREDICTION_HEADING = "Before you see your result, where do you think your answers landed?";

/** The first seed that gives this answer direction. */
export function seedFor(direction: AnswerDirection): number {
  for (let s = 1; ; s++) if (standardSequence(content, s).direction === direction) return s;
}

/** Start the quiz at a given question by seeding sessionStorage before the page loads. */
export async function openQuizAt(page: Page, seed: number, key: string) {
  const steps = standardSequence(content, seed).steps;
  const index = steps.findIndex((s) => s.key === key);
  if (index < 0) throw new Error(`${key} is not in the sequence`);
  const state: QuizState = { ...newQuiz(seed), index };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
  await page.goto("/quiz");
  await page.getByRole("heading", { level: 1, name: content.itemsById.get(steps[index].itemId)!.stem }).waitFor();
  await settled(page);
}

/** Wait for the question fade-in to finish, so measurements and contrast checks see the final state. */
export async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === "finished"));
}

/** Make saving fail (CI has no database), so the page offers the unsaved result. */
export async function failSaving(page: Page) {
  await page.route("**/api/responses", (route) => route.fulfill({ status: 503, body: "{}" }));
}

/** From /result: skip the guess if it is asked, answer the quick check if this person drew one, then open the unsaved result. */
export async function openUnsavedResult(page: Page) {
  const guess = page.getByRole("heading", { name: PREDICTION_HEADING });
  const check = page.getByRole("heading", { name: "One quick thing before your result" });
  const failed = page.getByRole("button", { name: "See my result without saving" });
  await guess.or(check).or(failed).waitFor();
  if (await guess.isVisible()) await page.getByRole("button", { name: "No guess, skip this" }).click();
  await check.or(failed).waitFor();
  if (await check.isVisible()) await page.getByRole("button", { name: "Somewhat" }).click();
  await failed.click();
  await page.getByRole("heading", { name: "Your six answers" }).waitFor();
}

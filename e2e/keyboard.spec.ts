// Spec section 8: full keyboard use and reduced motion respected.
import { expect, test } from "@playwright/test";
import { openQuizAt, seedFor, settled } from "./helpers";

test("the quiz works with the keyboard alone", async ({ page }) => {
  await page.goto("/");
  // Landing → Start → Let's go, by keyboard.
  await page.getByRole("link", { name: "Start", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Let's go" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Question 1 of 51")).toBeVisible();

  // Tab to the first answer and press Enter; focus moves to the next question's heading.
  const firstOption = page.getByRole("group").first().getByRole("button").first();
  for (let i = 0; i < 10 && !(await firstOption.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(firstOption).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Question 2 of 51")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();

  // Back by keyboard keeps the answer.
  await page.getByRole("button", { name: "Back" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Question 1 of 51")).toBeVisible();
  await expect(page.getByRole("group").first().getByRole("button").first()).toHaveAttribute("aria-pressed", "true");
});

test("every control shows a visible focus ring", async ({ page }) => {
  await openQuizAt(page, seedFor("disagree_first"), "C5-05");
  for (const name of ["Back", "Larger text", "Skip", "Strongly disagree"]) {
    const el = page.getByRole("button", { name, exact: true });
    await el.focus();
    // Keyboard focus, so :focus-visible applies.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(el).toBeFocused();
    const outline = await el.evaluate((e) => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth);
    expect(outline).toBe("solid 2px");
  }
});

test("reduced motion turns off the fade between questions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openQuizAt(page, seedFor("disagree_first"), "C5-05");
  await page.getByRole("group").first().getByRole("button").first().click();
  await page.getByText(/^Question \d+ of 51$/).waitFor();
  await page.waitForTimeout(500);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  expect(running).toBe(0);
  const animation = await page.locator("h1").evaluate((e) => getComputedStyle(e.parentElement!).animationName);
  expect(animation).toBe("none");
  await settled(page);
});

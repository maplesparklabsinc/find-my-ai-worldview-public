// docs/01-product-spec.md 5.3: the statement and all seven options fit on one
// phone screen without scrolling, tested at 390x660 with the longest statement.
import { expect, test } from "@playwright/test";
import { QUIZ, content, openQuizAt, seedFor } from "./helpers";

const LONGEST = "C5-05";

test("C5-05 is the longest statement in the standard form (item bank 0.8.0)", QUIZ, () => {
  const statements = content.items.items.filter((i) => i.format === "L7" && i.forms.includes("S"));
  const longest = statements.reduce((a, b) => (b.stem.length > a.stem.length ? b : a));
  expect(longest.id).toBe(LONGEST);
});

for (const direction of ["disagree_first", "agree_first"] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`statement and all seven answers fit at 390x660 (${direction}, ${scheme})`, scheme === "light" ? QUIZ : {}, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 660 });
      await page.emulateMedia({ colorScheme: scheme });
      await openQuizAt(page, seedFor(direction), LONGEST);
      await page.evaluate(() => document.fonts.ready);

      const options = page.getByRole("group").getByRole("button");
      await expect(options).toHaveCount(7);
      const first = direction === "disagree_first" ? "Strongly disagree" : "Strongly agree";
      await expect(options.first()).toHaveText(first);

      const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
      const last = await options.last().boundingBox();
      expect(heading!.y).toBeGreaterThanOrEqual(0);
      expect(last!.y + last!.height).toBeLessThanOrEqual(660);
      for (const o of await options.all()) expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(scrollable).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/fit-${direction}-${scheme}.png` });
    });
  }
}

// Issue #11: S1 was rewritten and is one of the longest scenarios now. Every
// scenario in the standard form must fit the same phone screen without scrolling.
const SCENARIOS = content.items.items.filter((i) => i.format === "SC" && i.forms.includes("S")).map((i) => i.id);

for (const id of SCENARIOS) {
  test(`scenario ${id} and all its options fit at 390x660`, QUIZ, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 660 });
    await openQuizAt(page, seedFor("disagree_first"), id);
    await page.evaluate(() => document.fonts.ready);
    const options = page.getByRole("group").getByRole("button");
    await expect(options).toHaveCount(content.itemsById.get(id)!.options.length);
    const last = await options.last().boundingBox();
    await page.screenshot({ path: `test-results/fit-${id}.png` });
    expect(last!.y + last!.height).toBeLessThanOrEqual(660);
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(scrollable).toBeLessThanOrEqual(0);
  });
}

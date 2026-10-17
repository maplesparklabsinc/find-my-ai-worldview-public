// Issue #84: "Where people live" as a world map, checked on /dev/admin-map
// (the real card with made-up numbers), since /admin needs a database.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const AREAS: [string, number][] = [
  ["Canada", 31],
  ["United States", 24],
  ["Latin America", 4],
  ["United Kingdom", 5],
  ["Elsewhere in Europe", 9],
  ["Middle East", 1],
  ["Africa", 1],
  ["South Asia", 7],
  ["East and Southeast Asia", 6],
  ["Australia or New Zealand", 3],
];

for (const scheme of ["light", "dark"] as const) {
  test(`the map: a number on every area, beside Completions per day, and axe passes (${scheme})`, async ({ browser }) => {
    const page = await (await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } })).newPage();
    await page.goto("/dev/admin-map");
    const map = page.getByRole("group", { name: /World map of where people live/ });
    await expect(map).toHaveAccessibleName(/Most answers: Canada \(31\), United States \(24\), Elsewhere in Europe \(9\)\./);
    for (const [name, n] of AREAS) {
      const area = map.getByRole("img", { name: new RegExp(`^${name}: ${n}, `) });
      await expect(area).toBeVisible();
      await expect(area.locator("text")).toHaveText(String(n));
    }
    await expect(page.getByText("Somewhere else: 2 · Not answered: 4")).toBeVisible();

    // Side by side on a wide screen.
    const perDay = await page.getByRole("region", { name: "Completions per day" }).boundingBox();
    const where = await page.getByRole("region", { name: "Where people live", exact: true }).boundingBox();
    expect(Math.abs(perDay!.y - where!.y)).toBeLessThan(2);
    expect(where!.x).toBeGreaterThan(perDay!.x + perDay!.width);

    // The table is under a closed toggle on desktop.
    await expect(page.getByRole("region", { name: "Where people live: the numbers" })).toBeHidden();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    await page.getByRole("region", { name: "Where people live", exact: true }).screenshot({ path: `test-results/admin-map-${scheme}.png` });

    await page.getByText("Show the numbers").click();
    await expect(page.getByRole("region", { name: "Where people live: the numbers" })).toBeVisible();
    const after = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(after.violations.map((v) => v.id)).toEqual([]);
  });
}

test("keyboard focus and hover show the tooltip; Escape hides it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dev/admin-map");
  const map = page.getByRole("group", { name: /World map/ });
  const tooltip = page.locator("[data-map-tooltip]");
  await map.getByRole("img", { name: /^United Kingdom:/ }).focus();
  await expect(tooltip).toHaveText(/United Kingdom\s*All time: 5 · 5%\s*Last 7 days: 2 · 8%/);
  await page.keyboard.press("Tab");
  await expect(tooltip).toContainText("Elsewhere in Europe");
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await map.getByRole("img", { name: /^South Asia:/ }).hover();
  await expect(tooltip).toContainText("South Asia");
  await page.getByRole("region", { name: "Where people live", exact: true }).screenshot({ path: "test-results/admin-map-tooltip.png" });
});

test("on a phone the cards stack and the numbers are open", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/admin-map");
  const perDay = await page.getByRole("region", { name: "Completions per day" }).boundingBox();
  const where = await page.getByRole("region", { name: "Where people live", exact: true }).boundingBox();
  expect(where!.y).toBeGreaterThan(perDay!.y + perDay!.height);
  await expect(page.getByRole("region", { name: "Where people live: the numbers" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("region", { name: "Where people live", exact: true }).screenshot({ path: "test-results/admin-map-phone.png" });
});

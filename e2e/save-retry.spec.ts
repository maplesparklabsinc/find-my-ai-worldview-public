// Saves retry in the browser (issue #59, lib/save). Saving is mocked.
import { expect, test, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { getCopy } from "@/lib/content/copy";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";

const copy = getCopy();
const answers = vectors.score_cases.find((x) => x.id === "steward")!.answers;

/** A finished quiz in this tab (seed 4242 draws no quick check), with analytics events collected in window.events. */
async function finished(page: Page) {
  const state = { ...newQuiz(4242), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => {
    sessionStorage.setItem(k, v);
    const w = window as unknown as { va: (...a: unknown[]) => void; events: unknown[] };
    w.events = [];
    w.va = (...a: unknown[]) => void w.events.push(a);
  }, [STORAGE_KEY, JSON.stringify(state)] as const);
}

async function saveEvents(page: Page) {
  const events = await page.evaluate(() => (window as unknown as { events: [string, { name?: string; data?: unknown }][] }).events);
  return events.filter(([, e]) => e?.name?.startsWith("save_")).map(([, e]) => ({ name: e.name, data: e.data }));
}

test("a save that fails twice and then works goes to the result, with no message", async ({ page }) => {
  await finished(page);
  const keys: unknown[] = [];
  await page.route("**/api/responses", async (route) => {
    keys.push(route.request().postDataJSON().submission_key);
    if (keys.length === 1) return route.abort("connectionreset");
    if (keys.length === 2) return route.fulfill({ status: 503, body: "{}" });
    return route.fulfill({ status: 201, json: { id: "Retry0Saved0Ok", token: "t" } });
  });
  await page.goto("/result");
  await expect(page).toHaveURL(/\/r\/Retry0Saved0Ok$/);
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);
  expect(await saveEvents(page)).toEqual([{ name: "save_retried", data: { step: "response", reason: "server" } }]);
});

test("a save that always fails shows the calm message and Try again, and the result is still there", async ({ page }) => {
  await finished(page);
  let posts = 0;
  await page.route("**/api/responses", (route) => {
    posts += 1;
    return route.fulfill({ status: 500, body: "{}" });
  });
  await page.goto("/result");
  await expect(page.getByRole("alert").filter({ hasText: copy.saving.failed })).toBeVisible();
  await expect(page.getByRole("button", { name: copy.saving.retry })).toBeVisible();
  expect(posts).toBe(3);
  expect(await saveEvents(page)).toEqual([{ name: "save_failed", data: { step: "response", reason: "server" } }]);
  await page.getByRole("button", { name: copy.saving.view_unsaved }).click();
  await expect(page.getByRole("heading", { name: "Your six answers" })).toBeVisible();
});

test("a refused save (too quick) is never retried", async ({ page }) => {
  await finished(page);
  let posts = 0;
  await page.route("**/api/responses", (route) => {
    posts += 1;
    return route.fulfill({ status: 400, json: { error: "refused", reason: "too_quick" } });
  });
  await page.goto("/result");
  await expect(page.getByRole("alert").filter({ hasText: copy.saving.too_quick })).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(posts).toBe(1);
  expect(await saveEvents(page)).toEqual([]);
});

// Fixes from the end-to-end runs before launch (issue #18). Saving is mocked
// here; the tests at the bottom need a database and run only with E2E_DB=1.
import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";
import { getCopy } from "@/lib/content/copy";
import { SEQUENCE_VERSION } from "@/lib/form";
import { content, failSaving, openQuizAt, openUnsavedResult } from "./helpers";

const copy = getCopy();
const answers = vectors.score_cases.find((x) => x.id === "steward")!.answers;

/** A finished quiz in this tab. Seed 4242 draws no quick check. */
async function finished(page: Page) {
  const state = { ...newQuiz(4242), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
}

// ---------- Saving ----------

test("Try again sends the quiz once, with the same submission key (SE-05, SE-06)", async ({ page }) => {
  await finished(page);
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/responses", async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: posts.length === 1 ? 500 : 503, body: "{}" });
  });
  await page.goto("/result");
  await page.getByRole("button", { name: "Try again" }).click();
  // Each save is tried 3 times (lib/save), all with the first key.
  await expect.poll(() => posts.length).toBe(6);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // Give a second, unwanted request time to show up.
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(6);
  expect(posts[0].submission_key).toMatch(/^[0-9a-f-]{36}$/);
  for (const p of posts) expect(p.submission_key).toBe(posts[0].submission_key);
});

for (const [reason, status, message, retry] of [
  ["too_quick", 400, copy.saving.too_quick, false],
  ["outdated", 400, copy.saving.outdated, false],
  ["rate_limited", 429, copy.saving.rate_limited, true],
] as const) {
  test(`a refused save says why: ${reason} (FL-01, FL-02)`, async ({ page }) => {
    await finished(page);
    await page.route("**/api/responses", (route) => route.fulfill({ status, json: { error: "refused", reason } }));
    await page.goto("/result");
    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(retry ? 1 : 0);
    if (reason === "outdated") {
      await page.getByRole("button", { name: copy.saving.start_again }).click();
      await expect(page).toHaveURL(/\/start$/);
      expect(await page.evaluate((k) => sessionStorage.getItem(k), STORAGE_KEY)).toBeNull();
    } else {
      await page.getByRole("button", { name: "See my result without saving" }).click();
      await expect(page.getByRole("heading", { name: "Your six answers" })).toBeVisible();
    }
  });
}

test("a reply without a result ID is treated as a failed save, not followed (DI-02)", async ({ page }) => {
  await finished(page);
  await page.route("**/api/responses", (route) => route.fulfill({ status: 201, json: { token: "x" } }));
  await page.goto("/result");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page).toHaveURL(/\/result$/);
});

// ---------- Content for #18 ----------

test("someone unsure who answered strongly sees the still-forming note", async ({ page }) => {
  const strong = vectors.score_cases.find((x) => x.id === "unsettled_but_strong")!.answers;
  const state = { ...newQuiz(4242), index: 999, answers: strong, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
  await failSaving(page);
  await page.goto("/result");
  await openUnsavedResult(page);
  await expect(page.getByText(content.narratives.unsettled_note)).toBeVisible();
});

// ---------- Headline ----------

test("a matched headline is one heading that reads as a sentence, not the name alone (AC-02)", async ({ page }) => {
  await failSaving(page);
  await finished(page);
  await page.goto("/result");
  await openUnsavedResult(page);
  const name = content.perspectives.perspectives.find((p) => p.id === "stewards")!.name;
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName(`${copy.results.closest_label}: ${name}`);
  await expect(page.locator('[role="alert"]:not(next-route-announcer *)')).toHaveCount(0);
});

// ---------- Missing results ----------

test("a missing result is a 404 for link previewers and browsers, and says so", async ({ page, request }) => {
  // A malformed ID is missing without asking the database.
  for (const path of ["/r/nope", "/c/nope"]) {
    expect((await request.get(path, { headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } })).status()).toBe(404);
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: copy.result_page.not_found_heading })).toBeVisible();
  }
});

// ---------- Headers ----------

test("security headers on pages and API routes (SQ-04)", async ({ request }) => {
  for (const res of [await request.get("/"), await request.post("/api/responses", { data: "not json" })]) {
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
    expect(h["x-powered-by"]).toBeUndefined();
  }
});

test("the content security policy doesn't block the page's own scripts", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) blocked.push(m.text());
  });
  await failSaving(page);
  await finished(page);
  await page.goto("/result");
  await openUnsavedResult(page);
  expect(blocked).toEqual([]);
});

// ---------- 320px with large text ----------

/** Page-wide horizontal scroll, plus any control, heading or header part that sticks out past the right edge. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = Array.from(document.querySelectorAll("button, a, h1, h2, header *, nav *"))
      .filter((e) => e.getBoundingClientRect().right > w + 1 || e.scrollWidth > e.clientWidth + 1)
      .map((e) => (e.textContent ?? "").trim().slice(0, 40));
    return document.documentElement.scrollWidth > w ? ["(page scrolls sideways)", ...out] : out;
  });

const bigText = async (browser: Browser, options: BrowserContextOptions = {}) => {
  const page = await (await browser.newContext({ viewport: { width: 320, height: 700 }, ...options })).newPage();
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.fontSize = "200%")));
  return page;
};

test("no page-wide horizontal scroll at 320px with 200% text (AC-04)", async ({ browser }) => {
  const page = await bigText(browser);
  await page.goto("/privacy");
  expect(await sideways(page)).toEqual([]);
  await failSaving(page);
  await finished(page);
  await page.goto("/result");
  await openUnsavedResult(page);
  expect(await sideways(page)).toEqual([]);
});

test("quiz questions and options wrap at 320px with 200% text (AC-04)", async ({ browser }) => {
  // A long statement, a trade-off with long options, the trust grid, and a question with Skip in the header.
  for (const key of ["C5-09", "C5-T1", "D4", "S4"]) {
    const page = await bigText(browser);
    await openQuizAt(page, 1, key);
    expect(await sideways(page), key).toEqual([]);
    await page.context().close();
  }
});

test("the admin header and nav wrap at 320px with 200% text (AC-04)", async ({ browser }) => {
  const page = await bigText(browser, { httpCredentials: { username: "walter", password: process.env.ADMIN_PASSWORD! } });
  await page.goto("/admin/perspectives");
  await page.getByRole("heading", { level: 1, name: "Perspectives" }).waitFor();
  expect(await sideways(page)).toEqual([]);
});

// ---------- With a database ----------

test.describe("with a database", () => {
  test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");

  test("the same quiz saved twice is stored once, and the new token replaces the old (RS-05)", async ({ request }) => {
    const data = {
      form: content.config.form,
      seed: 4242,
      sequence_version: SEQUENCE_VERSION,
      answers,
      timings_ms: { "C1-01": 90_000 },
      submission_key: crypto.randomUUID(),
    };
    const first = await request.post("/api/responses", { data });
    expect(first.status()).toBe(201);
    const a = await first.json();
    const second = await request.post("/api/responses", { data });
    expect(second.status()).toBe(201);
    const b = await second.json();
    expect(b.id).toBe(a.id);
    expect(b.token).not.toBe(a.token);
    const patch = (token: string) => request.patch(`/api/responses/${a.id}`, { data: { fit_rating: 3 }, headers: { "x-edit-token": token } });
    expect((await patch(a.token)).status()).toBe(404);
    expect((await patch(b.token)).status()).toBe(204);
    // A different quiz is a different row.
    const other = await request.post("/api/responses", { data: { ...data, submission_key: crypto.randomUUID() } });
    expect((await other.json()).id).not.toBe(a.id);
  });

  test("a fit rating that doesn't save is un-highlighted, and a saved one shows after reload (CP-04)", async ({ page }) => {
    await finished(page);
    await page.goto("/result");
    await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
    const option = (name: string) => page.getByRole("group", { name: "Does this fit you?" }).getByRole("button", { name });

    await page.route("**/api/responses/*", (route) => route.fulfill({ status: 500, body: "{}" }));
    await option("Very well").click();
    await expect(page.getByText(copy.fit.error)).toBeVisible();
    await expect(option("Very well")).toHaveAttribute("aria-pressed", "false");

    await page.unroute("**/api/responses/*");
    await option("Very well").click();
    await expect(page.getByText(copy.fit.quick_thanks)).toBeVisible();
    await page.reload();
    await expect(option("Very well")).toHaveAttribute("aria-pressed", "true");
  });

  test("shares are counted only when they go through (SH-01, AN-01)", async ({ browser }) => {
    // A phone with a share menu, until noShare is set. window.va collects analytics events.
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { va: (...a: unknown[]) => void; events: unknown[]; shareResult: "cancel" | "ok"; clipResult: "fail" | "ok" };
      w.events = [];
      w.va = (...a: unknown[]) => void w.events.push(a);
      w.shareResult = "cancel";
      w.clipResult = "fail";
      if (sessionStorage.getItem("noShare")) Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      else navigator.share = () => (w.shareResult === "ok" ? Promise.resolve() : Promise.reject(new DOMException("cancelled", "AbortError")));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => (w.clipResult === "ok" ? Promise.resolve() : Promise.reject(new Error("denied"))) },
      });
      // The fallback copy (issue #26) fails too while clipResult is "fail".
      document.execCommand = () => w.clipResult === "ok";
    });
    await finished(page);
    await page.goto("/result");
    await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
    const shares = () =>
      page.evaluate(() =>
        (window as unknown as { events: [string, { name?: string; data?: { channel: string } }][] }).events
          .filter(([kind, e]) => kind === "event" && e.name === "result_shared")
          .map(([, e]) => e.data?.channel),
      );
    const block = page.getByRole("region", { name: "Share your result" });
    const setResults = (share: string, clip: string) =>
      page.evaluate(([a, b]) => {
        const w = window as unknown as { shareResult: string; clipResult: string };
        w.shareResult = a;
        w.clipResult = b;
      }, [share, clip] as const);

    // A closed share menu isn't counted; one that goes through is.
    await block.getByRole("button", { name: "Share", exact: true }).click();
    await page.waitForTimeout(300);
    expect(await shares()).toEqual([]);
    await setResults("ok", "ok");
    await block.getByRole("button", { name: "Share", exact: true }).click();
    await expect.poll(shares).toEqual(["native"]);

    // Without a share menu: Copy link, counted only when the copy goes through.
    await page.evaluate(() => sessionStorage.setItem("noShare", "1"));
    await page.reload();
    await block.getByRole("button", { name: "Copy link" }).click();
    await page.waitForTimeout(300);
    expect(await shares()).toEqual([]);
    // A copy that didn't go through leaves the link to copy by hand.
    await expect(block.getByRole("textbox", { name: "Copy link" })).toBeVisible();
    await setResults("ok", "ok");
    await block.getByRole("button", { name: "Copy link" }).click();
    await expect.poll(shares).toEqual(["copy"]);
  });
});

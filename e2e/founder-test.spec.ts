// Fixes from the founder's end-to-end test (issue #37) that aren't on the
// result page: getting back to a quiz in progress, starting over, the trust
// grid's heading, and the admin gate and single-response pages. The admin
// responses test needs a database and runs only with E2E_DB=1.
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { SAME_PASSWORD_WARNING } from "@/lib/admin/gate";
import { getCopy } from "@/lib/content/copy";
import { standardSequence } from "@/lib/form";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";
import { content, openQuizAt, seedFor, settled } from "./helpers";

const copy = getCopy();
const password = process.env.ADMIN_PASSWORD!;
const basic = (p: string) => ({ authorization: `Basic ${Buffer.from(`walter:${p}`).toString("base64")}` });

async function audit(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

/** Answer the first `n` questions by tapping the first option (all are single-tap at the start of the quiz). */
async function answerSome(page: Page, n: number) {
  for (let i = 1; i <= n; i++) {
    await expect(page.getByText(`Question ${i} of`)).toBeVisible();
    await page.getByRole("group").first().getByRole("button").first().click();
  }
  await expect(page.getByText(`Question ${n + 1} of`)).toBeVisible();
}

// ---------- Resume and start over ----------

for (const path of ["/", "/start"]) {
  test(`${path}: a quiz in progress can be picked up where it was left, or started over`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("link", { name: path === "/" ? copy.landing.start_button : copy.start.button, exact: true })).toBeVisible();
    await expect(page.getByText(copy.resume.in_progress)).toHaveCount(0);

    await page.goto("/quiz");
    await answerSome(page, 3);
    const before = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!), STORAGE_KEY);

    await page.goto(path);
    await expect(page.getByText(copy.resume.in_progress).first()).toBeVisible();
    // In place of the start buttons, not as well: they would only pick the quiz up again.
    for (const name of [copy.landing.start_button, copy.landing.second_start_button, copy.start.button]) {
      await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
    }
    await audit(page);

    await page.getByRole("link", { name: copy.resume.continue }).first().click();
    await expect(page.getByText("Question 4 of")).toBeVisible();
    expect(await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!).seed, STORAGE_KEY)).toBe(before.seed);

    await page.goto(path);
    await page.getByRole("button", { name: copy.resume.start_over }).first().click();
    await expect(page.getByText("Question 1 of")).toBeVisible();
    const after = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!), STORAGE_KEY);
    expect(after.answers).toEqual({});
    expect(after.index).toBe(0);
  });
}

test("Privacy, How this works and What's changed link back to the quiz in progress, or to the start", async ({ page }) => {
  for (const path of ["/privacy", "/how-it-works", "/changes"]) {
    await page.goto(path);
    const back = page.getByRole("link", { name: copy.nav.back_to_start });
    await expect(back).toHaveAttribute("href", "/");
    await expect(back).not.toHaveAttribute("target", /./);
  }
  await page.goto("/quiz");
  await answerSome(page, 2);
  for (const path of ["/privacy", "/how-it-works", "/changes"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: copy.nav.back_to_start })).toHaveCount(0);
    await page.getByRole("link", { name: copy.nav.back_to_quiz }).click();
    await expect(page.getByText("Question 3 of")).toBeVisible();
  }
});

test("Before you start: the Privacy link opens in a new tab", async ({ page, context }) => {
  await page.goto("/start");
  const link = page.getByRole("link", { name: "Privacy (opens in a new tab)" });
  await expect(link).toHaveAttribute("target", "_blank");
  const [tab] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toBe("/privacy");
  expect(new URL(page.url()).pathname).toBe("/start");
});

test("Skip is top right on every kind of question, trade-offs included", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  const seed = seedFor("disagree_first");
  for (const key of ["C1-01", "S1", "C3-T1", "D4", "D9"]) {
    await openQuizAt(page, seed, key);
    const skip = page.getByRole("button", { name: "Skip", exact: true });
    const box = (await skip.boundingBox())!;
    expect(box.y, key).toBeLessThan(60);
    expect(box.x + box.width, key).toBeGreaterThan(390 - 40);
    await expect(page.getByRole("button", { name: "Skip this question" })).toHaveCount(0);
  }
  // On a trade-off it moves on without an answer.
  await openQuizAt(page, seed, "C3-T1");
  const n = Number((await page.getByText(/^Question \d+ of/).textContent())!.match(/\d+/)![0]);
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText(`Question ${n + 1} of`)).toBeVisible();
  expect(await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k)!).answers["C3-T1"], STORAGE_KEY)).toBeUndefined();
});

// ---------- Trust grid ----------

test("trust grid: the row name is the heading, the shared question smaller above it, and it fits at 390×660", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  const item = content.itemsById.get("D4")!;
  await openQuizAt(page, seedFor("disagree_first"), "D4");
  const stem = page.getByRole("heading", { level: 1, name: item.stem });
  const row = page.getByRole("heading", { level: 2, name: item.rows[0] });
  await expect(row).toBeVisible();
  const size = (l: typeof row) => l.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await size(row)).toBeGreaterThan(await size(stem));
  // The row name looks like any question's statement.
  const statement = await page.evaluate(() => {
    const probe = document.createElement("h1");
    probe.className = "type-statement";
    document.body.appendChild(probe);
    const s = getComputedStyle(probe);
    const out = [s.fontSize, s.fontWeight, s.lineHeight];
    probe.remove();
    return out;
  });
  expect(await row.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight, getComputedStyle(e).lineHeight])).toEqual(statement);
  expect(await stem.evaluate((e) => getComputedStyle(e).color)).not.toBe(await row.evaluate((e) => getComputedStyle(e).color));
  expect((await stem.boundingBox())!.y).toBeLessThan((await row.boundingBox())!.y);
  await expect(page.getByText(`1 of ${item.rows.length}`, { exact: true })).toBeVisible();
  // Each row's options are named by the row.
  await expect(page.getByRole("group", { name: item.rows[0] })).toBeVisible();

  // Fits: the last option of every row is on screen without scrolling.
  for (let r = 0; r < item.rows.length; r++) {
    await expect(page.getByRole("heading", { level: 2, name: item.rows[r] })).toBeVisible();
    const last = (await page.getByRole("group").first().getByRole("button").last().boundingBox())!;
    expect(last.y + last.height, item.rows[r]).toBeLessThanOrEqual(660);
    if (r < item.rows.length - 1) await page.getByRole("group").first().getByRole("button").nth(1).click();
  }
  await audit(page);
});

// ---------- Admin ----------

test("/admin asks in its own realm, apart from the site password's", async ({ request }) => {
  const res = await request.get("/admin/responses");
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toBe('Basic realm="admin", charset="UTF-8"');
});

test("/admin is a 404 when ADMIN_PASSWORD is the same as SITE_PASSWORD, with one warning that names neither", async () => {
  test.setTimeout(60_000);
  // A second server from the same build, with both passwords the same.
  const port = 3290;
  const same = "e2e-same-password-for-both";
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...process.env, ADMIN_PASSWORD: same, SITE_PASSWORD: same },
    detached: true,
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  try {
    const auth = basic(same);
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await fetch(`http://localhost:${port}/`, { headers: auth }).then((r) => r.ok, () => false);
      if (!ready) await new Promise((r) => setTimeout(r, 200));
    }
    expect(ready).toBe(true);
    for (const path of ["/admin", "/admin/responses", "/admin/perspectives"]) {
      expect((await fetch(`http://localhost:${port}${path}`, { headers: auth })).status, path).toBe(404);
    }
    // The rest of the site still opens with the site password.
    expect((await fetch(`http://localhost:${port}/privacy`, { headers: auth })).status).toBe(200);
    expect(log.split(SAME_PASSWORD_WARNING).length - 1).toBe(1);
    expect(log).not.toContain(same);
  } finally {
    process.kill(-server.pid!, "SIGTERM");
  }
});

test.describe("with a database", () => {
  test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");

  test("/admin/responses lists single responses and shows one in full, never with an email or free text", async ({ page, browser, request }) => {
    const tag = Date.now().toString(36);
    const email = `responses-e2e-${tag}@example.com`;
    const d9 = `free text that must stay private ${tag}`;
    const feedbackBody = `Responses e2e feedback ${tag}`;
    const answers = { ...vectors.score_cases.find((x) => x.id === "steward")!.answers, D9: d9 };
    // Seed 34 draws the quick check.
    const state = { ...newQuiz(34), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true };
    await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
    await page.goto("/result");
    await page.getByRole("button", { name: copy.quick_check.options[3] }).click();
    await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    // The quick-check note is the last line of the fit questions (issue #37), not a box at the top.
    const note = page.getByText(/^Before your result, you rated a short description\./);
    await expect(note).toBeVisible();
    expect((await note.boundingBox())!.y).toBeGreaterThan((await page.getByRole("heading", { name: copy.fit.heading }).boundingBox())!.y);
    expect((await note.boundingBox())!.y).toBeLessThan((await page.getByRole("heading", { name: copy.share.heading }).boundingBox())!.y);
    await page.getByRole("group", { name: copy.fit.heading }).getByRole("button", { name: copy.fit.options[1] }).click();
    await expect(page.getByRole("status").filter({ hasText: copy.fit.quick_thanks })).toBeVisible();
    const token = await page.evaluate((rid) => JSON.parse(localStorage.getItem("fmaw-mine-v2") ?? "{}")[rid] as string, id);
    const consent = { email, response_id: id, consent_version: "0.1.0", consent: true };
    expect((await request.post("/api/research-contact", { data: consent, headers: { "x-edit-token": token } })).status()).toBe(204);
    const fb = { type: "confusing_question", item_ids: ["C5-05"], body: feedbackBody, email, may_quote: true, response_id: id };
    expect((await request.post("/api/feedback", { data: fb })).status()).toBe(204);

    const admin = await (await browser.newContext({ httpCredentials: { username: "walter", password } })).newPage();
    await admin.goto("/admin");
    await admin.getByRole("link", { name: "Look at single responses" }).click();
    await expect(admin.getByRole("heading", { level: 1, name: "Responses" })).toBeVisible();
    await expect(admin.getByRole("navigation", { name: "Admin pages" }).getByRole("link", { name: "Responses" })).toHaveAttribute("aria-current", "page");
    // Filtered to Stewards.
    await admin.getByRole("combobox", { name: "Result" }).selectOption({ label: "Stewards" });
    await admin.getByRole("button", { name: "Show" }).click();
    await expect(admin).toHaveURL(/result=stewards/);
    // Only the date is stored, so within a day the order is by ID: page through to find this one.
    const row = admin.getByRole("row").filter({ hasText: id });
    const pages = Number((await admin.getByRole("status").innerText()).match(/of (\d+)$/)?.[1] ?? 1);
    for (let n = 2; n <= pages && (await row.count()) === 0; n++) {
      const url = new URL(admin.url());
      url.searchParams.set("page", String(n));
      await admin.goto(url.toString());
      await expect(admin.getByRole("status")).toContainText(`page ${n} of`);
    }
    await expect(row).toContainText("Stewards");
    await expect(row).toContainText(`2 · ${copy.fit.options[1]}`);
    await expect(row).toContainText(`Quick check (own, Stewards): ${copy.quick_check.options[3]}`);
    for (const h of ["Response", "Completed", "Result", "Fit", "Guess or quick check", "Answered"]) {
      await expect(admin.getByRole("columnheader", { name: h })).toBeVisible();
    }
    await audit(admin);
    for (const text of [email, d9, feedbackBody, "@example.com"]) expect(await admin.content()).not.toContain(text);

    await row.getByRole("link", { name: id }).click();
    await expect(admin.getByRole("heading", { level: 1, name: id })).toBeVisible();
    await expect(admin.getByText("Free text: answered")).toBeVisible();
    await expect(admin.getByRole("row").filter({ hasText: "C5-05" })).toContainText(content.itemsById.get("C5-05")!.short!);
    await expect(admin.getByText(standardSequence(content, 34).direction === "agree_first" ? "Agree first" : "Disagree first")).toBeVisible();
    await expect(admin.getByText("34", { exact: true })).toBeVisible();
    await expect(admin.getByRole("row").filter({ hasText: "Stewards" }).first()).toContainText(/\d\.\d{3}/);
    await audit(admin);
    for (const text of [email, d9, feedbackBody, "@example.com"]) expect(await admin.content()).not.toContain(text);

    // An unknown ID says so.
    await admin.goto("/admin/responses/zzzzzzzzzzzzzz");
    await expect(admin.getByRole("heading", { level: 1 })).toContainText("No response called");
  });
});

// Pages that read a stored response: the result page (with the feedback
// section open), the shared link's invitation to compare, an older compare
// link, and a comparison. They need a database, so they run only with E2E_DB=1
// (DATABASE_URL from .env.local).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { getCopy } from "@/lib/content/copy";
import { screenCount } from "@/lib/form";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";
import { content, settled } from "./helpers";

const copy = getCopy();

test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");

async function audit(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}

/**
 * A client address of its own for each saving browser, so this file's many
 * saves don't use up the per-address rate limit (20 per 10 minutes).
 */
const ownAddress = (page: Page) =>
  page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

/** Finish a quiz with a reference vector's answers and return the saved result's path. */
async function save(page: Page, vector: string, seed: number): Promise<string> {
  await ownAddress(page);
  const answers = vectors.score_cases.find((x) => x.id === vector)!.answers;
  const state = { ...newQuiz(seed), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
  await page.goto("/result");
  await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
  return new URL(page.url()).pathname;
}

for (const scheme of ["light", "dark"] as const) {
  test(`stored result with the feedback open, and a comparison (${scheme})`, async ({ page, browser }) => {
    await page.emulateMedia({ colorScheme: scheme });
    // Seed 4242 draws no quick check.
    const path = await save(page, "steward", 4242);
    await page.getByRole("button", { name: "Somewhat" }).click();
    await page.getByText(copy.fit.section_heading, { exact: true }).click();
    await expect(page.getByRole("group", { name: "Which fits you better?" })).toBeVisible();
    await page.getByText("Check your six answers").click();
    await audit(page);

    const friend = await (await browser.newContext({ colorScheme: scheme })).newPage();
    await friend.goto(path);
    await audit(friend);
    await friendTakesQuiz(friend, friend.getByRole("button", { name: copy.result_page.compare_button }).first());
    await expect(friend.getByRole("heading", { name: "Side by side" })).toBeVisible();
    await audit(friend);
  });
}

/** From a visitor's view or invite, `button` starts a quiz; finish it (with enough time to be saved) and land on the result. */
async function friendTakesQuiz(friend: Page, button: ReturnType<Page["locator"]>, timings: Record<string, number> = { "C1-01": 90_000 }) {
  await ownAddress(friend);
  await button.click();
  await friend.waitForURL(/\/start$/);
  await finishFromStart(friend, timings);
}

/** From /start: "Let's go", then a finished quiz (seeded, as answering 51 screens by hand is slow) and on to /result. */
async function finishFromStart(friend: Page, timings: Record<string, number>) {
  await friend.getByRole("link", { name: copy.start.button }).click();
  await friend.waitForURL(/\/quiz$/);
  // Once the quiz has saved its own fresh start, so it can't overwrite the finished one below.
  await friend.getByText(/^Question 1 of/).waitFor();
  const answers = vectors.score_cases.find((x) => x.id === "accelerator")!.answers;
  await friend.evaluate(
    ([k, v]) => sessionStorage.setItem(k, v),
    [STORAGE_KEY, JSON.stringify({ ...newQuiz(4242), index: 999, answers, timings, finished: true, prediction: { kind: "skipped" } })] as const,
  );
  await friend.goto("/result");
}

/** The friend's comparison, then the link they send back opening the same comparison for the person who shared. */
async function comparisonAndSendBack(owner: Page, friend: Page, ownerPath: string) {
  await friend.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
  await expect(friend.getByRole("heading", { name: "Side by side" })).toBeVisible();
  await expect(friend.getByRole("heading", { name: copy.compare.section_heading.replace("{name}", copy.compare.friend_fallback) })).toBeVisible();
  // Send it back: the friend's share button carries /r/{friend}?vs={owner}.
  const friendId = new URL(friend.url()).pathname.split("/").pop()!;
  const ownerId = ownerPath.split("/").pop()!;
  const back = friend.getByRole("region", { name: copy.compare.send_back_button.replace("{name}", copy.compare.friend_fallback) });
  await back.getByRole("button").click();
  const sent = await friend.evaluate(() => (window as unknown as { shared: { url: string }[] }).shared);
  expect(sent).toHaveLength(1);
  expect(new URL(sent[0].url).pathname + new URL(sent[0].url).search).toBe(`/r/${friendId}?vs=${ownerId}`);
  // The person who shared opens it and sees the comparison from their side.
  await owner.goto(`/r/${friendId}?vs=${ownerId}`);
  await expect(owner.getByRole("heading", { name: "Side by side" })).toBeVisible();
  await expect(owner.getByRole("link", { name: copy.compare.your_result })).toHaveAttribute("href", ownerPath);
}

/** A friend's browser at phone size, with a share menu that records what it was given. */
async function friendBrowser(browser: Browser): Promise<Page> {
  const friend = await (await browser.newContext({ viewport: { width: 390, height: 660 } })).newPage();
  await friend.addInitScript(() => {
    const w = window as unknown as { shared: unknown[] };
    w.shared = [];
    navigator.share = (data?: ShareData) => (w.shared.push(data), Promise.resolve());
  });
  return friend;
}

// Issue #37: the founder's compare link didn't work. Every way in from a shared
// result goes through the quiz to the comparison and back.
for (const place of ["top", "bar", "end"] as const) {
  test(`shared link → quiz → comparison → sent back, from the ${place} button`, async ({ page, browser }) => {
    const path = await save(page, "steward", 4242);
    const friend = await friendBrowser(browser);
    await friend.goto(`${path}?view=shared`);
    await friend.getByRole("heading", { level: 2, name: copy.results.six_answers }).waitFor();
    const buttons = friend.getByRole("button", { name: copy.result_page.compare_button });
    let button = buttons.first();
    if (place === "bar") {
      await friend.getByRole("heading", { level: 2, name: copy.results.six_answers }).scrollIntoViewIfNeeded();
      await friend.evaluate(() => window.scrollBy(0, 200));
      button = friend.getByTestId("compare-bar").getByRole("button");
      await expect(button).toBeVisible();
    } else if (place === "end") {
      button = friend.getByRole("region", { name: copy.result_page.take_it_heading }).last().getByRole("button");
    }
    await friendTakesQuiz(friend, button);
    await comparisonAndSendBack(page, friend, path);
  });
}

test("the shared link is read-only, even in the browser that saved the result", async ({ page }) => {
  const path = await save(page, "steward", 4242);
  // The owner's own page has their controls...
  await expect(page.getByRole("heading", { name: copy.share.heading })).toBeVisible();
  // ...and the link they share shows exactly what a friend sees.
  await page.goto(`${path}?view=shared`);
  await page.getByRole("heading", { level: 2, name: copy.results.six_answers }).waitFor();
  await expect(page.getByText(copy.result_page.shared_anonymous)).toBeVisible();
  // The top and end boxes; the phone bar stays hidden while the top box is on screen.
  await expect(page.getByRole("region", { name: copy.result_page.take_it_heading })).toHaveCount(2);
  for (const name of [copy.share.heading, copy.fit.heading, copy.research_consent.heading]) {
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: copy.result_page.again_link })).toHaveCount(0);
  await expect(page.getByText(copy.fit.section_heading, { exact: true })).toHaveCount(0);
  await audit(page);

  // Pasted from a share menu that copies the text too: still read-only.
  await page.goto(`${path}?view=shared%20I%20landed%20closest%20to%20Stewards`);
  await page.getByRole("heading", { level: 2, name: copy.results.six_answers }).waitFor();
  await expect(page.getByRole("heading", { name: copy.research_consent.heading })).toHaveCount(0);
  await expect(page.getByText(copy.result_page.shared_anonymous)).toBeVisible();
});

test("nothing flashes on load: the owner never sees the visitor's banner or invitation, even for a moment", async ({ page }) => {
  const path = await save(page, "steward", 4242);
  // Record every text the page ever shows while it loads, not just where it ends up.
  await page.addInitScript((watch: string[]) => {
    const w = window as unknown as { seen: string[] };
    w.seen = [];
    new MutationObserver(() => {
      const text = document.body?.innerText ?? "";
      for (const t of watch) if (text.includes(t) && !w.seen.includes(t)) w.seen.push(t);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, [copy.result_page.shared_anonymous, copy.result_page.take_it_heading]);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: copy.share.heading })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: copy.share.heading })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([]);
});

test("an older compare link still works all the way through, without a name", async ({ page, browser }) => {
  const path = await save(page, "steward", 4242);
  const id = path.split("/").pop()!;
  const friend = await friendBrowser(browser);
  await friend.goto(`/c/${id}`);
  await expect(friend.getByText(copy.compare.invite_anonymous)).toBeVisible();
  await expect(friend.getByText(`${screenCount(content)} quick questions`, { exact: true })).toBeVisible();
  await audit(friend);
  await friendTakesQuiz(friend, friend.getByRole("button", { name: copy.compare.invite_button }));
  await friend.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
  await comparisonAndSendBack(page, friend, path);
});

test("a friend who finishes too quickly is told the comparison needs a saved result, and can start again still linked", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const path = await save(page, "steward", 4242);
  const friend = await friendBrowser(browser);
  await friend.goto(path);
  await friendTakesQuiz(friend, friend.getByRole("button", { name: copy.result_page.compare_button }).first(), { "C1-01": 20_000 });
  await expect(friend.getByText(copy.saving.too_quick)).toBeVisible();
  await expect(friend.getByText(copy.saving.too_quick_compare)).toBeVisible();
  await friend.getByRole("button", { name: copy.saving.start_again }).click();
  await friend.waitForURL(/\/start$/);
  expect(await friend.evaluate(() => sessionStorage.getItem("fmaw-compare-with"))).toBe(path.split("/").pop());
  await expect(friend.getByText(copy.resume.in_progress)).toHaveCount(0);
  // Taking it again, with time, now gives the comparison.
  await finishFromStart(friend, { "C1-01": 90_000 });
  await comparisonAndSendBack(page, friend, path);
});

test("only the browser that saved a result can change it (edit token)", async ({ page, request }) => {
  const path = await save(page, "steward", 4242);
  const id = path.split("/").pop()!;
  const token = await page.evaluate((rid) => JSON.parse(localStorage.getItem("fmaw-mine-v2") ?? "{}")[rid] as string, id);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const consent = { email: "visitor@example.com", response_id: id, consent_version: "0.1.0", consent: true };
  const wrong = "A".repeat(43);

  // A visitor who only knows the shared link gets "not found", never "forbidden".
  for (const headers of [{}, { "x-edit-token": wrong }] as Record<string, string>[]) {
    for (const data of [{ fit_rating: 1 }, { better_fit: "none" }, { track_checks: { C1: "further_low" } }]) {
      expect((await request.patch(`/api/responses/${id}`, { data, headers })).status()).toBe(404);
    }
    expect((await request.post("/api/research-contact", { data: consent, headers })).status()).toBe(404);
  }
  // Nothing changed: the invite page shows no name.
  await page.goto(`/c/${id}`);
  await expect(page.getByText("Someone shared this with you", { exact: false })).toBeVisible();

  // The owner's token works, for an existing result only.
  const own = { "x-edit-token": token };
  expect((await request.patch(`/api/responses/${id}`, { data: { fit_rating: 4 }, headers: own })).status()).toBe(204);
  expect((await request.patch(`/api/responses/zzzzzzzzzzzzzz`, { data: { fit_rating: 4 }, headers: own })).status()).toBe(404);
  expect((await request.post("/api/research-contact", { data: { ...consent, email: "owner@example.com" }, headers: own })).status()).toBe(204);
});

test("a visitor sees the result without the owner's controls", async ({ page, browser }) => {
  const path = await save(page, "steward", 4242);
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(path);
  await expect(visitor.getByRole("heading", { name: copy.results.six_answers })).toBeVisible();
  await expect(visitor.getByRole("heading", { name: copy.result_page.take_it_heading })).toHaveCount(2);
  await expect(visitor.getByText(copy.fit.section_heading, { exact: true })).toHaveCount(0);
  await expect(visitor.getByRole("heading", { name: copy.share.heading })).toHaveCount(0);
  // Visitors see "Elsewhere you might hear" too (issue #39).
  await expect(visitor.locator("summary", { hasText: copy.results.elsewhere })).toHaveCount(1);
});

// A shared result reads the same for a visitor as for its owner, with a banner
// on top saying it was shared (issue #37: a mix of "you" and "they" confused people).
for (const vector of ["steward", "mixed_between", "all_neither_settled"] as const) {
  test(`a shared ${vector} result: the banner for visitors, and the owner's wording for everyone`, async ({ page, browser }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const path = await save(page, vector, 4242);
    await expect(page.getByRole("heading", { level: 2, name: copy.results.six_answers })).toBeVisible();
    await expect(page.getByText(copy.result_page.shared_anonymous)).toHaveCount(0);
    const ownerHeadline = await page.getByRole("heading", { level: 1 }).innerText();

    const visitor = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await visitor.goto(path);
    await expect(visitor.getByText(copy.result_page.shared_anonymous)).toBeVisible();
    expect(await visitor.getByRole("heading", { level: 1 }).innerText()).toBe(ownerHeadline);
    await expect(visitor.getByRole("heading", { level: 2, name: copy.results.six_answers })).toBeVisible();
    expect(await visitor.locator("main").innerText()).not.toMatch(/\bTheir (result|six answers|closest)\b|\bThey sit\b/);
    // The banner comes first.
    const banner = await visitor.getByText(copy.result_page.shared_anonymous).boundingBox();
    const h1 = await visitor.getByRole("heading", { level: 1 }).boundingBox();
    expect(banner!.y).toBeLessThan(h1!.y);
    await visitor.context().close();
  });
}

test("a first name can't be added to a result, even by its owner", async ({ page, request }) => {
  const path = await save(page, "steward", 4242);
  const id = path.split("/").pop()!;
  const token = await page.evaluate((rid) => JSON.parse(localStorage.getItem("fmaw-mine-v2") ?? "{}")[rid] as string, id);
  expect((await request.patch(`/api/responses/${id}`, { data: { compare_name: "Sam" }, headers: { "x-edit-token": token } })).status()).toBe(400);
});

for (const width of [390, 320]) {
  test(`the share box says who sees the link before its button (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await save(page, "steward", 4242);
    const box = page.getByRole("region", { name: copy.share.heading });
    const note = box.getByText(copy.share.note);
    await expect(note).toBeVisible();
    expect((await note.boundingBox())!.y).toBeLessThan((await box.getByRole("button").first().boundingBox())!.y);
  });
}

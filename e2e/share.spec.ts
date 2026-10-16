// Sharing a result (issues #26 and #37): one Share button where the device has
// a share menu, otherwise Copy link; the share card as a thumbnail with
// Download image. They need a stored result, so they run only with E2E_DB=1
// (DATABASE_URL from .env.local).
import { expect, test, type Browser, type Page } from "@playwright/test";
import vectors from "@/reference/test-vectors.json";
import { cardAlt } from "@/components/share-card";
import { getCopy } from "@/lib/content/copy";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";
import { resultView, shareText } from "@/lib/results";
import { score, type Answers } from "@/lib/scoring";
import { content } from "./helpers";

const copy = getCopy();
const s = copy.share;

test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");

/**
 * Save a reference vector's answers from a fresh browser and return the page
 * on its result. Each test uses its own client address so these saves don't
 * use up the other tests' rate limit. `share`: give the page a share menu
 * that records what it was given, or take any away.
 */
async function saved(browser: Browser, vector: string, ip: string, share: "menu" | "none" = "none"): Promise<Page> {
  const page = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } })).newPage();
  const answers = vectors.score_cases.find((x) => x.id === vector)!.answers;
  const state = { ...newQuiz(4242), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
  await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
  await page.addInitScript((mode) => {
    const w = window as unknown as { shared: unknown[] };
    w.shared = [];
    if (mode === "menu") navigator.share = (data?: ShareData) => (w.shared.push(data), Promise.resolve());
    else Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  }, share);
  await page.goto("/result");
  await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
  return page;
}

const box = (page: Page) => page.getByRole("region", { name: s.heading });

test("the share images for an In between result are served", async ({ browser, request }) => {
  const page = await saved(browser, "mixed_between", "203.0.113.31");
  const path = new URL(page.url()).pathname;
  for (const url of [`${path}/image`, `${path}/opengraph-image`]) {
    const res = await request.get(url);
    expect(res.status(), url).toBe(200);
    expect(res.headers()["content-type"], url).toBe("image/png");
  }
});

test("with a share menu: one Share button that sends the title, text and link, and no file", async ({ browser }) => {
  const page = await saved(browser, "steward", "203.0.113.34", "menu");
  const share = box(page).getByRole("button");
  await expect(share).toHaveCount(1);
  await expect(share).toHaveText(s.share_button);
  await share.click();
  const answers = vectors.score_cases.find((x) => x.id === "steward")!.answers as Answers;
  const text = shareText(copy, resultView(content, copy, score(content, answers), answers));
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { shared: unknown[] }).shared))
    .toEqual([{ title: copy.site.name, text, url: `${page.url()}?view=shared` }]);
});

test("without a share menu: Copy link copies the link only and says so for 3 seconds", async ({ browser }) => {
  const page = await saved(browser, "steward", "203.0.113.35");
  await page.evaluate(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t: string) => (w.copied.push(t), Promise.resolve()) }, configurable: true });
  });
  const button = box(page).getByRole("button");
  await expect(button).toHaveCount(1);
  await button.click();
  await expect(button).toHaveText(s.copied);
  await expect(box(page).locator("[aria-live=polite]")).toHaveText(s.copied);
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([`${page.url()}?view=shared`]);
  await expect(button).toHaveText(s.copy_link, { timeout: 5000 });
  await expect(box(page).locator("[aria-live=polite]")).toHaveText("");
});

test("the box shows who can see the link first, then the button, the card as a thumbnail and Download image; no channel links", async ({
  browser,
}) => {
  const page = await saved(browser, "steward", "203.0.113.36");
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const y = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!.y;
  const note = box(page).getByText(s.note);
  expect(await y(note)).toBeLessThan(await y(box(page).getByRole("button")));

  const answers = vectors.score_cases.find((x) => x.id === "steward")!.answers as Answers;
  const view = resultView(content, copy, score(content, answers), answers);
  const thumb = box(page).getByRole("img", { name: cardAlt({ view, headline: view.headline }) });
  await expect(thumb).toBeVisible();
  // The card is drawn on request, so give it a moment to arrive.
  await expect.poll(() => thumb.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth), { timeout: 15_000 }).toBe(1080);
  const width = (await thumb.boundingBox())!.width;
  expect(width).toBeGreaterThan(250);
  expect(width).toBeLessThanOrEqual(322);
  // The thumbnail and the link both download the card.
  for (const link of [box(page).getByRole("link", { name: s.download_image }), box(page).getByRole("link", { name: cardAlt({ view, headline: view.headline }) })]) {
    await expect(link).toHaveAttribute("href", `/r/${id}/image`);
    await expect(link).toHaveAttribute("download", "");
  }
  const download = page.waitForEvent("download");
  await box(page).getByRole("link", { name: s.download_image }).click();
  expect((await download).suggestedFilename()).toBe("find-my-ai-worldview.png");

  for (const channel of ["X", "LinkedIn", "Facebook", "WhatsApp", "Email"]) await expect(page.getByRole("link", { name: channel, exact: true })).toHaveCount(0);
});

test("a shared link previews with the share card", async ({ browser, request }) => {
  const page = await saved(browser, "steward", "203.0.113.37");
  // The link people share is the read-only view; it previews the same way.
  const html = await (await request.get(`${new URL(page.url()).pathname}?view=shared`)).text();
  const meta = (p: string) => html.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`))?.[1];
  expect(meta("og:image")).toMatch(/\/r\/[A-Za-z0-9]{14}\/opengraph-image/);
  expect(meta("og:image:width")).toBe("1200");
  expect(meta("og:image:height")).toBe("630");
  expect(meta("og:title")).toBeTruthy();
  expect(meta("og:description")).toBe(copy.landing.lede);
  expect(meta("twitter:card")).toBe("summary_large_image");
});

test("Copy link works without the Clipboard API, and never opens a dialog", async ({ browser }) => {
  const page = await saved(browser, "steward", "203.0.113.32");
  page.on("dialog", (d) => {
    throw new Error(`unexpected ${d.type()} dialog`);
  });
  // As on plain http: no navigator.clipboard.
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }));
  await box(page).getByRole("button", { name: s.copy_link }).click();
  await expect(box(page).getByRole("button", { name: s.copied }).or(box(page).getByRole("textbox", { name: s.copy_link }))).toBeVisible();
});

test("when the browser won't copy at all, the link is shown selected to copy by hand", async ({ browser }) => {
  const page = await saved(browser, "steward", "203.0.113.33");
  page.on("dialog", (d) => {
    throw new Error(`unexpected ${d.type()} dialog`);
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = () => false;
  });
  await box(page).getByRole("button", { name: s.copy_link }).click();
  const field = box(page).getByRole("textbox", { name: s.copy_link });
  await expect(field).toHaveValue(`${page.url()}?view=shared`);
  await expect(field).toHaveAttribute("readonly", "");
  const selected = await field.evaluate((e: HTMLInputElement) => [e.selectionStart, e.selectionEnd, e.value.length]);
  expect(selected).toEqual([0, selected[2], selected[2]]);
});

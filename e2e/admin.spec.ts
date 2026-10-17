// The admin pages (/admin, issue #14; /admin/perspectives, issue #16).
// playwright.config.ts gives the test server an ADMIN_PASSWORD. The gate and the
// perspectives page are checked without a database; the dashboard only with
// E2E_DB=1. "Unset means 404" is in lib/__tests__/proxy.test.ts, since the
// running server always has a password here.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import perspectives from "@/content/perspectives.json";
import vectors from "@/reference/test-vectors.json";
import { statementKeys } from "@/lib/admin/quality";
import { getContent } from "@/lib/content";
import { STORAGE_KEY, newQuiz } from "@/lib/quiz";

const password = process.env.ADMIN_PASSWORD!;
const basic = (p: string) => ({ authorization: `Basic ${Buffer.from(`walter:${p}`).toString("base64")}` });

test("/admin needs the admin password", async ({ request }) => {
  expect((await request.get("/admin")).status()).toBe(401);
  expect((await request.get("/admin", { headers: basic("wrong") })).status()).toBe(401);
});

test.describe("/admin/perspectives", () => {
  test("needs the admin password", async ({ request }) => {
    expect((await request.get("/admin/perspectives")).status()).toBe(401);
    const res = await request.get("/admin/perspectives", { headers: basic(password) });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const unknown = await request.get("/admin/perspectives?release=nope", { headers: basic(password) });
    expect(await unknown.text()).toContain("no frozen release called");
  });

  test("shows every perspective, passes axe, and picks older releases", async ({ browser }) => {
    for (const scheme of ["light", "dark"] as const) {
      const admin = await (await browser.newContext({ colorScheme: scheme, httpCredentials: { username: "walter", password } })).newPage();
      await admin.goto("/admin/perspectives");
      await expect(admin.getByRole("heading", { level: 1, name: "Perspectives" })).toBeVisible();
      await expect(admin.getByRole("navigation", { name: "Admin pages" }).getByRole("link", { name: "Perspectives" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      for (const p of perspectives.perspectives) await expect(admin.getByRole("heading", { level: 2, name: p.name })).toBeVisible();
      await admin.getByText("Scoring details").first().click();
      const results = await new AxeBuilder({ page: admin }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    }

    const admin = await (await browser.newContext({ httpCredentials: { username: "walter", password } })).newPage();
    await admin.goto("/admin/perspectives");
    await admin.getByRole("link", { name: "0.1.0-0.1.0-0.3.0-0.2.1" }).click();
    await expect(admin).toHaveURL(/release=0\.1\.0-0\.1\.0-0\.3\.0-0\.2\.1/);
    await expect(admin.getByRole("heading", { level: 2, name: "Fair-Share Advocates" })).toBeVisible();
    await expect(admin.getByRole("link", { name: "0.1.0-0.1.0-0.3.0-0.2.1" })).toHaveAttribute("aria-current", "page");
  });

  test("fits a phone: no page-wide horizontal scroll", async ({ browser }) => {
    const admin = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, httpCredentials: { username: "walter", password } })
    ).newPage();
    await admin.goto("/admin/perspectives");
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    await admin.getByText("Scoring details").first().click();
    const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// Issue #55: the download form has its own tab, and needs no database to show.
test.describe("/admin/download", () => {
  test("needs the admin password, is a tab, passes axe and fits a phone", async ({ browser, request }) => {
    expect((await request.get("/admin/download")).status()).toBe(401);
    for (const scheme of ["light", "dark"] as const) {
      const admin = await (
        await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 844 }, httpCredentials: { username: "walter", password } })
      ).newPage();
      await admin.goto("/admin/download");
      await expect(admin.getByRole("heading", { level: 1, name: "Download data" })).toBeVisible();
      await expect(admin.getByRole("navigation", { name: "Admin pages" }).getByRole("link", { name: "Download data" })).toHaveAttribute("aria-current", "page");
      await expect(admin.getByRole("combobox", { name: "Content release" })).toHaveValue("");
      await expect(admin.getByRole("button", { name: "Download data" })).toBeVisible();
      await audit(admin);
      const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("with a database", () => {
  test.skip(process.env.E2E_DB !== "1", "set E2E_DB=1 to run against a database");

  test("shows aggregates only: no emails, no free text", async ({ page, browser, request }) => {
    const tag = Date.now().toString(36);
    const email = `admin-e2e-${tag}@example.com`;
    const d9 = `free text that must stay private ${tag}`;
    const body = `Admin e2e feedback ${tag}`;

    // Save a result with a D9 answer, leave a research email and feedback with an email.
    // With a CX-T1 answer, so the "Rules for low-risk AI" table has a row.
    const answers = {
      ...vectors.score_cases.find((x) => x.id === "steward")!.answers,
      D9: d9,
      "CX-T1": { choice: 0, strength: "strongly" },
    };
    const state = { ...newQuiz(4242), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
    await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
    await page.goto("/result");
    await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const token = await page.evaluate((rid) => JSON.parse(localStorage.getItem("fmaw-mine-v2") ?? "{}")[rid] as string, id);
    const consent = { email, response_id: id, consent_version: "0.1.0", consent: true };
    expect((await request.post("/api/research-contact", { data: consent, headers: { "x-edit-token": token } })).status()).toBe(204);
    const fb = { type: "confusing_question", item_ids: ["C5-04"], body, email, may_quote: true, response_id: id };
    expect((await request.post("/api/feedback", { data: fb })).status()).toBe(204);
    // The same result attached from the browser that saved it (with its edit token).
    const own = { ...fb, body: `${body} from the owner`, email: undefined };
    expect((await request.post("/api/feedback", { data: own, headers: { "x-edit-token": token } })).status()).toBe(204);

    const res = await request.get("/admin", { headers: basic(password) });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const html = await res.text();
    expect(html).toContain(body);
    expect(html).toContain(`/admin/responses/${id}`);
    expect(html).not.toContain(email);
    expect(html).not.toContain(d9);
    expect(html).not.toContain("@example.com");

    for (const scheme of ["light", "dark"] as const) {
      const admin = await (await browser.newContext({ colorScheme: scheme, httpCredentials: { username: "walter", password } })).newPage();
      await admin.goto("/admin");
      await expect(admin.getByRole("heading", { level: 1, name: "What's coming in" })).toBeVisible();
      const rows = admin.getByRole("row").filter({ hasText: body });
      await expect(rows.filter({ hasText: "Email given" })).toContainText("Attached result (unverified)");
      await expect(rows.filter({ hasText: "from the owner" })).toContainText("Their result");
      await expect(admin.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      const results0 = await new AxeBuilder({ page: admin }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results0.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
      // Rules for low-risk AI is on the Research checks tab.
      await admin.getByRole("navigation", { name: "Admin pages" }).getByRole("link", { name: "Research checks" }).click();
      await expect(admin.getByRole("heading", { level: 1, name: "Research checks" })).toBeVisible();
      expect(await admin.content()).not.toContain(email);
      const depends = admin.getByRole("region", { name: "Rules for low-risk AI" });
      await expect(depends.getByRole("row").filter({ hasText: "Stewards" })).toContainText("%");
      // The card and the table inside it share the name; the first is the card, which has the note.
      await expect(depends.first()).toContainText("Item bank 0.7.0 and later (the wording changed in 0.7.0).");
      const results = await new AxeBuilder({ page: admin }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    }
  });

  // Issue #51: research opt-in, everything they told us, and readable text with
  // any typed address masked. No admin page ever contains a seeded address.
  test("shows research opt-in and what they wrote, with every email address masked", async ({ page, browser, request }) => {
    const tag = Date.now().toString(36);
    const contact = `research-${tag}@example.com`;
    const replyTo = `reply-${tag}@example.com`;
    const inFreeText = `freetext-${tag}@example.org`;
    const inFeedback = `feedback-${tag}@example.net`;
    const d9 = `Happy to talk more, write to ${inFreeText} anytime ${tag}`;
    const body = `The pace question was hard. Reach me at ${inFeedback} ${tag}`;

    const answers = { ...vectors.score_cases.find((x) => x.id === "steward")!.answers, D9: d9 };
    const state = { ...newQuiz(4243), index: 999, answers, timings: { "C1-01": 90_000 }, finished: true, prediction: { kind: "skipped" } };
    await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
    await page.goto("/result");
    await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const token = await page.evaluate((rid) => JSON.parse(localStorage.getItem("fmaw-mine-v2") ?? "{}")[rid] as string, id);
    const consent = { email: contact, response_id: id, consent_version: "0.1.0", consent: true };
    expect((await request.post("/api/research-contact", { data: consent, headers: { "x-edit-token": token } })).status()).toBe(204);
    const fb = { type: "confusing_question", item_ids: ["C3-02"], body, email: replyTo, may_quote: false, response_id: id };
    expect((await request.post("/api/feedback", { data: fb, headers: { "x-edit-token": token } })).status()).toBe(204);

    const seeded = [contact, replyTo, inFreeText, inFeedback];
    const admin = await (await browser.newContext({ httpCredentials: { username: "walter", password } })).newPage();
    const noAddresses = async () => {
      const html = await admin.content();
      for (const a of seeded) expect(html, admin.url()).not.toContain(a);
    };

    // The list, filtered to people who opted in, shows Yes.
    await admin.goto("/admin");
    await expect(admin.getByRole("link", { name: /Research sign-ups/ })).toHaveAttribute("href", "/admin/responses?research=yes");
    await expect(admin.getByRole("row").filter({ hasText: tag }).first()).toContainText("[email removed]");
    await noAddresses();
    await admin.goto("/admin/responses?research=yes");
    await expect(admin.getByRole("combobox", { name: "Research" })).toHaveValue("yes");
    const row = admin.getByRole("row").filter({ hasText: id });
    const pages = Number((await admin.getByRole("status").innerText()).match(/of (\d+)$/)?.[1] ?? 1);
    for (let n = 2; n <= pages && (await row.count()) === 0; n++) await admin.goto(`/admin/responses?research=yes&page=${n}`);
    await expect(row).toContainText("Yes");
    await noAddresses();

    // The detail page: everything they told us, masked.
    await admin.goto(`/admin/responses/${id}`);
    const told = admin.getByRole("region", { name: "What they told us" });
    await expect(told).toContainText("Opted in on");
    await expect(told).toContainText(`Happy to talk more, write to [email removed] anytime ${tag}`);
    await expect(told).toContainText(`The pace question was hard. Reach me at [email removed] ${tag}`);
    await expect(told).toContainText("left an email to reply to: Yes");
    await noAddresses();
    for (const path of ["/admin/responses?research=no", "/admin/perspectives", "/admin/research", "/admin/research?qall=1"]) {
      await admin.goto(path);
      await noAddresses();
    }
  });

  // Issue #55: the download has no seeded address, and a rushed, same-answer response is flagged.
  test("the data download has no email addresses, and a rushed same-answer response is flagged", async ({ page, browser, request }) => {
    const tag = Date.now().toString(36);
    const contact = `export-${tag}@example.com`;
    const replyTo = `export-reply-${tag}@example.com`;
    const inFreeText = `export-free-${tag}@example.org`;
    const inFeedback = `export-fb-${tag}@example.net`;
    const statements = statementKeys(getContent());
    // The same answer to every statement, about a second each, and long enough overall to be saved.
    const answers = { ...vectors.score_cases.find((x) => x.id === "steward")!.answers, D9: `Mail ${inFreeText} ${tag}` } as Record<string, unknown>;
    for (const k of statements) answers[k] = 4;
    const timings = { ...Object.fromEntries(statements.map((k) => [k, 1_000])), D11: 70_000 };
    // Seed 4242 draws no quick check.
    const state = { ...newQuiz(4242), index: 999, answers, timings, finished: true, prediction: { kind: "skipped" } };
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250)}` });
    await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)] as const);
    await page.goto("/result");
    await page.waitForURL(/\/r\/[A-Za-z0-9]{14}$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const token = await page.evaluate((rid) => JSON.parse(localStorage.getItem("fmaw-mine-v2") ?? "{}")[rid] as string, id);
    const from = { "x-forwarded-for": `198.51.101.${Math.floor(Math.random() * 250)}` };
    const consent = { email: contact, response_id: id, consent_version: "0.1.0", consent: true };
    expect((await request.post("/api/research-contact", { data: consent, headers: { ...from, "x-edit-token": token } })).status()).toBe(204);
    const fb = { type: "other", body: `Reach me at ${inFeedback} ${tag}`, email: replyTo, response_id: id };
    expect((await request.post("/api/feedback", { data: fb, headers: from })).status()).toBe(204);

    const res = await request.get("/admin/export", { headers: basic(password) });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/zip");
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="fmaw-export-\d{4}-\d{2}-\d{2}\.zip"$/);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const files = Object.fromEntries(Object.entries(unzipSync(new Uint8Array(await res.body()))).map(([k, v]) => [k, strFromU8(v)]));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "feedback.csv", "responses.csv"]);
    for (const text of Object.values(files)) {
      for (const a of [contact, replyTo, inFreeText, inFeedback]) expect(text).not.toContain(a);
    }
    const line = files["responses.csv"].split("\r\n").find((l) => l.startsWith(`${id},`))!;
    expect(line).toContain(`Mail [email removed] ${tag}`);
    expect(line).toMatch(/,yes,yes$/);
    expect(files["feedback.csv"]).toContain(`Reach me at [email removed] ${tag}`);
    expect((await request.get("/admin/export")).status()).toBe(401);

    const admin = await (await browser.newContext({ httpCredentials: { username: "walter", password } })).newPage();
    await admin.goto("/admin/responses?check=flagged");
    const row = admin.getByRole("row").filter({ hasText: id });
    const pages = Number((await admin.getByRole("status").innerText()).match(/of (\d+)$/)?.[1] ?? 1);
    for (let n = 2; n <= pages && (await row.count()) === 0; n++) await admin.goto(`/admin/responses?check=flagged&page=${n}`);
    await expect(row).toContainText("Too fast, Same answer");
    await admin.goto(`/admin/responses/${id}`);
    await expect(admin.getByRole("region", { name: "How the quiz was shown" })).toContainText("flagged: Too fast, Same answer");
  });

  test("every admin page passes axe in both themes", async ({ browser }) => {
    test.setTimeout(120_000);
    for (const scheme of ["light", "dark"] as const) {
      const admin = await (await browser.newContext({ colorScheme: scheme, httpCredentials: { username: "walter", password } })).newPage();
      await admin.goto("/admin/responses");
      const first = admin.getByRole("row").nth(1).getByRole("link");
      const href = (await first.count()) > 0 ? await first.first().getAttribute("href") : null;
      await audit(admin);
      if (href) {
        await admin.goto(href);
        await audit(admin);
      }
      await admin.goto("/admin");
      const pairs = admin.getByText("Show the In between pairs");
      if ((await pairs.count()) > 0) await pairs.click();
      await audit(admin);
      await admin.goto("/admin/research?qsort=skip&qall=1");
      await expect(admin.getByRole("heading", { level: 1, name: "Research checks" })).toBeVisible();
      await expect(admin.getByRole("navigation", { name: "Admin pages" }).getByRole("link", { name: "Research checks" })).toHaveAttribute("aria-current", "page");
      await audit(admin);
    }
  });

  test("fits a phone: no page-wide horizontal scroll", async ({ browser }) => {
    const admin = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, httpCredentials: { username: "walter", password } })
    ).newPage();
    await admin.goto("/admin/responses");
    const first = admin.getByRole("row").nth(1).getByRole("link");
    const href = (await first.count()) > 0 ? await first.first().getAttribute("href") : null;
    for (const path of ["/admin", "/admin/research", "/admin/research?qall=1", "/admin/responses", ...(href ? [href] : [])]) {
      await admin.goto(path);
      await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

async function audit(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`), page.url()).toEqual([]);
}

// The admin pages (/admin, issue #14; /admin/perspectives, issue #16).
// playwright.config.ts gives the test server an ADMIN_PASSWORD. The gate and the
// perspectives page are checked without a database; the dashboard only with
// E2E_DB=1. "Unset means 404" is in lib/__tests__/proxy.test.ts, since the
// running server always has a password here.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import perspectives from "@/content/perspectives.json";
import vectors from "@/reference/test-vectors.json";
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
    expect(html).toContain(`/r/${id}`);
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
      const depends = admin.getByRole("region", { name: "Rules for low-risk AI" });
      await expect(depends.getByRole("row").filter({ hasText: "Stewards" })).toContainText("%");
      // The card and the table inside it share the name; the first is the card, which has the note.
      await expect(depends.first()).toContainText("Item bank 0.7.0 and later (the wording changed in 0.7.0).");
      const results = await new AxeBuilder({ page: admin }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    }
  });

  test("fits a phone: no page-wide horizontal scroll", async ({ browser }) => {
    const admin = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, httpCredentials: { username: "walter", password } })
    ).newPage();
    await admin.goto("/admin");
    await expect(admin.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

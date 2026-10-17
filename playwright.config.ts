import { defineConfig, devices } from "@playwright/test";
import { LOCAL_TEST_URL } from "./scripts/local-db.mjs";

const PORT = 3200;

// The admin page (e2e/admin.spec.ts) needs a password on the test server.
process.env.ADMIN_PASSWORD ??= "e2e-admin-password";

// With E2E_DB=1 the test server saves to E2E_DATABASE_URL, or else the local
// Docker test database (npm run db:up), never fmaw_dev or .env.local's database.
const testDatabase: Record<string, string> =
  process.env.E2E_DB === "1" ? { DATABASE_URL: process.env.E2E_DATABASE_URL || LOCAL_TEST_URL } : {};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI's sharded jobs (PW_BLOB=1) also write a blob report, merged into one HTML report afterwards.
  reporter: process.env.CI ? [["list"], ["github"], ...(process.env.PW_BLOB ? [["blob"] as const] : [])] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use a preinstalled Chromium when one is provided (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // E2E_PREBUILT=1 starts from an existing .next/ build (CI builds once in the app job).
    command: process.env.E2E_PREBUILT === "1" ? `npx next start -p ${PORT}` : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // /dev/admin-map, the world map with made-up numbers (e2e/admin-map.spec.ts).
    env: { ...testDatabase, ENABLE_DEV_PAGE: "1" },
  },
});

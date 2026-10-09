import { defineConfig, devices } from "@playwright/test";

/**
 * Браузерні тести на найкрихкіші механіки (сітка дашборда, плеєр,
 * конструктор, таблиці, вихід). Вхід — dev-only `POST /api/test/login`
 * (e2e/fixtures.ts), тож потрібен `next dev`: конфіг сам підіймає його на
 * :3000, а запущений уже сервер використовує повторно.
 *
 * `npm run test:e2e` — усі; `npx playwright test e2e/dashboard.spec.ts` — один.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Тести ходять в одну dev-базу під одними персонами — послідовно, без гонок.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

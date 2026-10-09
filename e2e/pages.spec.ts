import { test, expect, loginAs, loginAdmin, PERSONAS, type Page } from "./fixtures";

/**
 * Обхід КОЖНОЇ сторінки кожного кабінету під потрібною роллю: сторінка
 * відповідає без помилки, React її «оживив» (гідратація пройшла) і в консолі
 * та на сторінці немає помилок. Ловить те, що юніт-тести не бачать: зламаний
 * імпорт, падіння серверного компонента, розбіжність SSR і клієнта.
 *
 * Матеріали стенду: «Тестовий курс на 15 модулів» (id 22, mechanics-15),
 * Вікторія Червона (id 327) у команді SV0036.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[HMR\]|\[Fast Refresh\]/,
  /was preloaded using link preload but not used/,
  /SECURITY WARNING: The SSL modes/,
  // Next dev сам пише про повільні/повторні запити — не помилки застосунку.
  /webpack|turbopack/i,
];

async function visit(page: Page, path: string, ready: string) {
  const problems: string[] = [];
  const onConsole = (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.some((re) => re.test(m.text()))) problems.push(`console: ${m.text().slice(0, 200)}`);
  };
  const onPageError = (e: Error) => problems.push(`pageerror: ${e.message.slice(0, 200)}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  const res = await page.goto(path);
  expect(res?.status(), `${path}: HTTP`).toBeLessThan(400);
  await expect(page.locator(ready).first(), `${path}: не дочекались «${ready}»`).toBeVisible({ timeout: 20_000 });
  // Гідратація: клієнтський React підхопив розмітку (а не лишив статичний HTML).
  await expect
    .poll(() => page.evaluate((sel) => Object.keys(document.querySelector(sel) || {}).some((k) => k.startsWith("__react")), ready), {
      message: `${path}: React не оживив сторінку`,
      timeout: 20_000,
    })
    .toBe(true);
  await page.waitForTimeout(500);
  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  expect(problems, `${path}: помилки`).toEqual([]);
}

test.describe("співробітник", () => {
  test.beforeEach(({ page }) => loginAs(page, PERSONAS.employee));
  for (const [path, ready] of [
    ["/hub", ".profile-card"],
    ["/hub/learn", ".course-tile"],
    ["/hub/achievements", ".hub-screen"],
    ["/hub/profile", ".profile-card"],
    ["/hub/notifications", ".hub-screen"],
    ["/courses/mechanics-15", ".cp-intro"],
  ] as const) {
    test(path, async ({ page }) => visit(page, path, ready));
  }
});

test.describe("керівник", () => {
  test.beforeEach(({ page }) => loginAs(page, PERSONAS.manager));
  for (const [path, ready] of [
    ["/manager", ".mgr-charts.is-ready"],
    ["/manager/team", ".mgr-team-table"],
    ["/manager/team?status=overdue", ".mgr-team-list"],
    ["/manager/team/327", ".mgr-enrollment-list"],
    ["/manager/courses", ".course-tile"],
    ["/manager/achievements", "main"],
    ["/manager/profile", ".profile-card"],
    ["/manager/notifications", "main"],
    ["/manager/report", "main"],
  ] as const) {
    test(path, async ({ page }) => visit(page, path, ready));
  }
});

test.describe("адмін", () => {
  test.beforeEach(({ page }) => loginAdmin(page));
  for (const [path, ready] of [
    ["/admin", ".adm-shell"],
    ["/admin/courses/22", ".admin-lesson-nav-item"],
    ["/admin/employees", ".admin-table"],
    ["/admin/employees/327", ".admin-table"],
    ["/admin/org", ".adm-shell"],
    ["/admin/badges", ".adm-shell"],
    ["/admin/data", ".adm-shell"],
    ["/admin/notifications", ".adm-shell"],
    ["/admin/rating", ".adm-shell"],
    ["/admin/audit", ".adm-shell"],
  ] as const) {
    test(path, async ({ page }) => visit(page, path, ready));
  }
});

test.describe("супер-адмін", () => {
  test.beforeEach(({ page }) => loginAdmin(page, "super"));
  for (const [path, ready] of [
    ["/admin/design", ".adm-shell"],
    ["/admin/api", ".adm-shell"],
  ] as const) {
    test(path, async ({ page }) => visit(page, path, ready));
  }
});

test.describe("без входу", () => {
  test("/register", async ({ page }) => visit(page, "/register", "main, form, body"));
  test("/admin/login", async ({ page }) => visit(page, "/admin/login", "form"));
  test("неіснуюча адреса — сторінка 404", async ({ page }) => {
    const res = await page.goto("/nemae-takoi-storinky");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: /На головну/ })).toBeVisible();
  });
});

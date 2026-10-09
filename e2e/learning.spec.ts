import { test, expect, loginAdmin, type Page } from "./fixtures";

/**
 * Головний шлях співробітника наживо: відкрити модуль із плану, прочитати
 * теорію, відповісти на питання, побачити «Модуль складено». Пише в dev-базу
 * (відповідь, результат модуля, бали) — тому призначення скидається через
 * адмінку і ДО тесту (якщо попередній прогін упав посередині), і ПІСЛЯ.
 */
const CODE = "SR0108";
const COURSE_ID = 22;
const SLUG = "mechanics-15";

async function resetEnrollment(page: Page, employeeId: number) {
  await loginAdmin(page);
  const list = await (await page.request.get(`/api/admin/employees/${employeeId}/enrollments`)).json();
  const enrollment = list.enrollments.find((e: { course: { id: number } }) => e.course.id === COURSE_ID);
  if (enrollment) expect((await page.request.delete(`/api/admin/enrollments/${enrollment.id}`)).ok()).toBeTruthy();
  const assigned = await page.request.post(`/api/admin/courses/${COURSE_ID}/assign`, { data: { employeeIds: [employeeId] } });
  expect(assigned.ok()).toBeTruthy();
}

test("співробітник складає модуль: теорія → питання → «Модуль складено»", async ({ page }) => {
  test.setTimeout(120_000);
  const { employee } = await (await page.request.post("/api/test/login", { data: { code: CODE } })).json();
  await resetEnrollment(page, employee.id);
  await page.request.post("/api/test/login", { data: { code: CODE } });
  try {
    await page.goto(`/courses/${SLUG}?module=101`);
    await expect(page.getByText(/Це модуль 1 курсу/).first()).toBeVisible();
    // «Далі», на останньому екрані модуля — «Завершити».
    const next = page.locator(".navbar .btn-primary").last();
    await next.click();

    const answered = page.waitForResponse((r) => r.url().includes(`/api/courses/${SLUG}/answer`) && r.request().method() === "POST" && r.status() === 200);
    await page.getByRole("button", { name: /Так, саме так/ }).click();
    await answered;
    await expect(page.locator(".opt.correct")).toBeVisible();

    const completed = page.waitForResponse((r) => r.url().includes(`/api/courses/${SLUG}/module-complete`), { timeout: 30_000 });
    await next.click();
    expect((await completed).ok()).toBeTruthy();
    await expect(page.locator(".result-title")).toContainText("складено!", { timeout: 15_000 });
  } finally {
    await resetEnrollment(page, employee.id);
  }
});

test("без мережі: результат модуля чекає на пристрої і досилається, щойно мережа є", async ({ page, context }) => {
  test.setTimeout(120_000);
  const { employee } = await (await page.request.post("/api/test/login", { data: { code: CODE } })).json();
  await resetEnrollment(page, employee.id);
  await page.request.post("/api/test/login", { data: { code: CODE } });
  try {
    await page.goto(`/courses/${SLUG}?module=101`);
    await expect(page.getByText(/Це модуль 1 курсу/).first()).toBeVisible();
    const next = page.locator(".navbar .btn-primary").last();
    await next.click();
    await expect(page.getByRole("button", { name: /Так, саме так/ })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: /Так, саме так/ }).click();
    await next.click();
    await expect(page.locator(".cp-save-queued")).toContainText("збережено на пристрої");
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /outbox/i.test(k) && localStorage.getItem(k) !== "[]"))).toBe(true);

    // Мережа повернулась — OfflineSync досилає чергу сам (подія online).
    const sent = page.waitForResponse((r) => r.url().includes(`/api/courses/${SLUG}/module-complete`) && r.status() === 200, { timeout: 30_000 });
    await context.setOffline(false);
    await sent;
    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => /outbox/i.test(k)).map((k) => localStorage.getItem(k)).join("")), { timeout: 15_000 })
      .toMatch(/^(\[\])?$/);
  } finally {
    await context.setOffline(false);
    await resetEnrollment(page, employee.id);
  }
});

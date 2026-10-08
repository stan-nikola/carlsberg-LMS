import { test, expect, loginAdmin } from "./fixtures";

/**
 * Конструктор: правка компонента зберігається при переході на ІНШИЙ компонент
 * (без таймера автозбереження) і переживає F5. Правимо кікер інфо-блока
 * тестового курсу і повертаємо назад у тому ж тесті.
 */
const COURSE_ID = 22; // «Тестовий курс на 15 модулів»

const isPatch = (r: { request: () => { method: () => string }; url: () => string }) =>
  r.request().method() === "PATCH" && r.url().includes("/api/admin/components/");

test("правка зберігається при переході на інший компонент і переживає F5", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`/admin/courses/${COURSE_ID}`);
  const firstItem = page.locator(".admin-lesson-nav-item").first();
  await expect(firstItem).toBeVisible();
  await firstItem.click();
  const kicker = page.locator(".admin-lesson-card input.admin-input-flex").first();
  await expect(kicker).toBeVisible();
  const original = await kicker.inputValue();
  const marker = `${original} [E2E]`;

  // Другий екран модуля 1 («Питання») — розгорнути й клікнути його компонент.
  const openSecondScreen = async () => {
    await page.locator(".admin-accordion-header-sub").nth(1).click();
    await page.locator(".admin-lesson-nav-item", { hasText: "саме так" }).first().click();
  };

  const patch = page.waitForResponse(isPatch);
  await kicker.fill(marker);
  await openSecondScreen();
  expect((await patch).ok()).toBeTruthy();

  await page.reload();
  await page.locator(".admin-lesson-nav-item").first().click();
  await expect(page.locator(".admin-lesson-card input.admin-input-flex").first()).toHaveValue(marker);

  // Повернути як було.
  const restore = page.waitForResponse(isPatch);
  await page.locator(".admin-lesson-card input.admin-input-flex").first().fill(original);
  await openSecondScreen();
  expect((await restore).ok()).toBeTruthy();
});

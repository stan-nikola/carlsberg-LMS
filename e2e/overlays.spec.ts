import { test, expect, loginAs, loginAdmin, PERSONAS } from "./fixtures";

/** Оверлеї на спільному useDismiss (hooks/useDismiss.ts): Esc + блок скролу сторінки. */

test("налаштування дашборда: Esc закриває, сторінка під шторкою не скролиться", async ({ page }) => {
  await loginAs(page, PERSONAS.manager);
  await page.goto("/manager");
  await expect(page.locator(".mgr-charts.is-ready")).toBeVisible();
  await page.getByRole("button", { name: "Налаштувати картки дашборда" }).click();
  await expect(page.locator(".mgr-drawer")).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mgr-drawer")).toHaveCount(0);
});

test("«Нова папка» в адмінці: Esc закриває, навіть коли фокус не в полі", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: /Нова папка|папк/i }).first().click();
  await expect(page.locator(".adm-modal")).toBeVisible();
  await page.locator(".adm-modal-title").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".adm-modal")).toHaveCount(0);
});

test("шторка налаштувань закривається Esc", async ({ page }) => {
  await loginAs(page, PERSONAS.employee);
  await page.goto("/hub");
  await page.locator(".appbar").getByRole("button", { name: "Налаштування" }).click();
  await expect(page.locator(".sheet-overlay.open")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet-overlay.open")).toHaveCount(0);
});

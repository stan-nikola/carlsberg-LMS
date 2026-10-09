import { test, expect, loginAs, PERSONAS } from "./fixtures";

/**
 * Плеєр: «Почати» з плану відкриває модуль одразу з першого екрана
 * (?module=N + key-remount), а відновлення з localStorage пропонує
 * продовжити з того самого місця. Жодних відповідей не надсилається —
 * у базі нічого не змінюється.
 */
const SLUG = "mechanics-15"; // «Тестовий курс на 15 модулів», стенд механіки

test.beforeEach(async ({ page }) => {
  await loginAs(page, PERSONAS.employee);
});

test("«Почати» з плану відкриває модуль одразу з першого екрана, і вдруге теж", async ({ page }) => {
  await page.goto(`/courses/${SLUG}`);
  await expect(page.locator(".cp-intro")).toBeVisible();
  const start = page.locator('a.cp-plan-square[href*="module=101"]');
  await start.click();
  await expect(page.locator(".cp-intro")).toHaveCount(0);
  await expect(page.locator(".cp-viewport")).toContainText("Це модуль 1 курсу");
  // Назад на план і знову «Почати» — без key-remount плеєр лишався б зі старим станом.
  await page.goBack();
  await expect(page.locator(".cp-intro")).toBeVisible();
  await start.click();
  await expect(page.locator(".cp-intro")).toHaveCount(0);
  await expect(page.locator(".cp-viewport")).toContainText("Це модуль 1 курсу");
});

test("прогрес відновлюється з того самого місця після перезавантаження", async ({ page }) => {
  await page.goto(`/courses/${SLUG}`);
  const next = page.locator(".navbar .btn-primary", { hasText: "Далі" });
  await next.click(); // вступ → теорія модуля 1
  await expect(page.locator(".cp-intro")).toHaveCount(0);
  await expect(page.locator(".cp-viewport")).toContainText("Це модуль 1 курсу");
  await next.click(); // теорія → питання; на вступі нічого не пишеться, перший запис пропускається
  await page.waitForTimeout(600);
  const saved = await page.evaluate((slug) => localStorage.getItem(`course_progress_${slug}`), SLUG);
  expect(saved, "localStorage course_progress_* після переходу").not.toBeNull();
  await page.reload();
  const prompt = page.getByRole("alertdialog", { name: "Продовжити курс" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Продовжити" }).click();
  await expect(page.locator(".cp-intro")).toHaveCount(0);
  await page.evaluate((slug) => localStorage.removeItem(`course_progress_${slug}`), SLUG);
});

test("лінія плану проходить крізь кожну станцію (і після анімації появи картки)", async ({ page }) => {
  await page.goto(`/courses/${SLUG}`);
  await expect(page.locator(".cp-plan-road-svg path").first()).toBeAttached();
  await page.waitForTimeout(1500);
  const missed = await page.evaluate(() => {
    const svg = document.querySelector(".cp-plan-road-svg")!;
    const s = svg.getBoundingClientRect();
    const pts = [...(svg.querySelector("path")!.getAttribute("d") || "").matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    return [...document.querySelectorAll(".cp-plan-dot")]
      .map((d) => {
        const r = d.getBoundingClientRect();
        return [r.left + r.width / 2 - s.left, r.top + r.height / 2 - s.top];
      })
      .filter(([x, y]) => !pts.some(([px, py]) => Math.abs(px - x) <= 1.5 && Math.abs(py - y) <= 1.5));
  });
  expect(missed, "станції, повз які йде лінія").toEqual([]);
});

import { test, expect, loginAdmin, type Page } from "./fixtures";
import type { Locator } from "@playwright/test";

/**
 * Конструктор: модулі, екрани й компоненти тягнуться за ручку (useDragReorder
 * handleOnly), порядок переживає F5. Міняємо місцями перші два і повертаємо.
 */
const COURSE_ID = 22; // «Тестовий курс на 15 модулів»

async function dragOnto(page: Page, handle: Locator, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 12 });
  await page.mouse.up();
}

const LISTS = [
  {
    name: "модулі",
    resource: "/api/admin/modules/",
    rows: (p: Page) => p.locator(".admin-editor-edit > .admin-block"),
    handle: ":scope > .admin-accordion-header > .admin-drag-handle",
    label: (row: Locator) => row.locator(":scope > .admin-accordion-header .admin-title-input").inputValue(),
  },
  {
    name: "екрани",
    resource: "/api/admin/screens/",
    rows: (p: Page) => p.locator(".admin-screen-list").first().locator(":scope > .admin-module"),
    handle: ":scope > .admin-accordion-header-sub > .admin-drag-handle",
    label: (row: Locator) => row.locator(":scope > .admin-accordion-header-sub h3").innerText(),
  },
  {
    name: "компоненти",
    resource: "/api/admin/components/",
    rows: (p: Page) => p.locator(".admin-lesson-nav").first().locator(":scope > .admin-lesson-nav-row"),
    handle: ":scope > .admin-drag-handle",
    label: (row: Locator) => row.locator(".admin-lesson-nav-item").innerText(),
  },
];

for (const list of LISTS) {
  test(`${list.name}: перетягування за ручку зберігає порядок`, async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`/admin/courses/${COURSE_ID}`);
    const rows = list.rows(page);
    await expect(rows.first()).toBeVisible();
    // У тестовому курсі на екрані по одному компоненту — додаємо тимчасовий другий.
    if (list.name === "компоненти") {
      const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/admin/components"));
      await page.getByRole("button", { name: "+ Додати компонент" }).first().click();
      expect((await created).ok()).toBeTruthy();
    }
    await expect(rows.nth(1)).toBeVisible();
    const [a, b] = [await list.label(rows.nth(0)), await list.label(rows.nth(1))];

    const swap = async () => {
      const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(list.resource));
      await dragOnto(page, rows.nth(0).locator(list.handle), rows.nth(1));
      expect((await saved).ok()).toBeTruthy();
    };

    await swap();
    await expect.poll(() => list.label(rows.nth(0))).toBe(b);
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect.poll(() => list.label(rows.nth(0))).toBe(b);
    expect(await list.label(rows.nth(1))).toBe(a);

    // Повернути як було.
    await swap();
    await expect.poll(() => list.label(rows.nth(0))).toBe(a);
    await page.waitForLoadState("networkidle");

    if (list.name === "компоненти") {
      await rows.nth(1).locator(".admin-lesson-nav-item").click();
      page.once("dialog", (d) => d.accept());
      const deleted = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/api/admin/components/"));
      await page.locator(".admin-lesson-card").getByRole("button", { name: "Видалити", exact: true }).click();
      expect((await deleted).ok()).toBeTruthy();
      await expect(rows).toHaveCount(1);
    }
  });
}

test("модулі в розгорнутому курсі на /admin тягнуться без перенесення самого курсу", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin");
  // Списковий вид: модулі розгортаються ВСЕРЕДИНІ рядка курсу, який сам
  // HTML5-draggable (перенесення в папку) — саме цей випадок і перевіряємо.
  await page.getByRole("button", { name: "Список" }).click();
  await page.getByRole("textbox", { name: "Пошук курсу" }).fill("Тестовий курс на 15");
  await page.locator(".admin-course-row", { hasText: "Тестовий курс на 15" }).first().locator(".admin-course-row-toggle").click();
  const list = page.locator(".admin-course-row .admin-block-list").first();
  const rows = list.locator(":scope > .admin-block-list-item");
  const [a, b] = [await rows.nth(0).innerText(), await rows.nth(1).innerText()];
  const swap = async () => {
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/admin/modules/"));
    await dragOnto(page, rows.nth(0).locator(".admin-drag-handle"), rows.nth(1));
    expect((await saved).ok()).toBeTruthy();
  };
  await swap();
  await expect.poll(() => rows.nth(0).innerText()).toBe(b);
  await swap();
  await expect.poll(() => rows.nth(0).innerText()).toBe(a);
  await page.waitForLoadState("networkidle");
});

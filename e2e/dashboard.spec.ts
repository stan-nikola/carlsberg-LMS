import { test, expect, loginAs, PERSONAS, type Page } from "./fixtures";

/**
 * Сітка дашборда керівника (gridstack, lib/dashboardHeights.ts): без дір і
 * накладань, висоти лише S/L (картка на всю ширину — по вмісту), стабільні
 * після перестановок у режимі редагування і після F5.
 */
type Box = { id: string; x: number; y: number; w: number; h: number; px: number };

async function readGrid(page: Page): Promise<Box[]> {
  await expect(page.locator(".mgr-charts.is-ready")).toBeVisible();
  // Після пересоздання сітки (gridEpoch) gs-* з'являються не одразу.
  await expect
    .poll(() => page.locator(".grid-stack-item:not([gs-w])").count(), { timeout: 5000 })
    .toBe(0);
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".grid-stack-item")].map((n) => ({
      id: n.getAttribute("gs-id") || "",
      x: Number(n.getAttribute("gs-x") || 0),
      y: Number(n.getAttribute("gs-y") || 0),
      w: Number(n.getAttribute("gs-w") || 0),
      h: Number(n.getAttribute("gs-h") || 0),
      px: (n.querySelector(".grid-stack-item-content")?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0,
    }))
  );
}

function assertBricks(boxes: Box[]) {
  const taken = (x: number, y: number, self: Box) =>
    boxes.some((n) => n !== self && x >= n.x && x < n.x + n.w && y >= n.y && y < n.y + n.h);
  for (const n of boxes) {
    expect([3, 6, 12], `${n.id}: ширина ${n.w}`).toContain(n.w);
    for (let x = n.x; x < n.x + n.w; x++) for (let y = n.y; y < n.y + n.h; y++) expect(taken(x, y, n), `${n.id} накладається`).toBe(false);
    if (n.w < 12) expect([280, 576], `${n.id}: висота ${n.px}px (лише S або L)`).toContain(n.px);
  }
  for (let x = 0; x < 12; x++) {
    let bottom = 0;
    for (const n of boxes.filter((b) => x >= b.x && x < b.x + b.w).sort((a, b) => a.y - b.y)) {
      expect(n.y, `діра в колонці ${x} над ${n.id}`).toBeLessThanOrEqual(bottom);
      bottom = Math.max(bottom, n.y + n.h);
    }
  }
}

async function dragCard(page: Page, fromId: string, toId: string) {
  // Тягнемо за ліву частину заголовка (іконка + назва, без посилань і
  // підказки), обидві картки — в кадрі: захоплення поза вʼюпортом gridstack
  // не бачить, а відпускання над іншою карткою читається як клік і вимикає
  // режим перестановки. Координати — одним evaluate після прокрутки.
  const { a, b } = await page.evaluate(
    ([f, t]: [string, string]) => {
      const h2 = (id: string) => document.querySelector(`.grid-stack-item[gs-id="${id}"] .mgr-chart-card > h2`)!;
      const top = Math.min(h2(f).getBoundingClientRect().top, h2(t).getBoundingClientRect().top);
      window.scrollBy(0, top - 120);
      const r = (id: string) => {
        const { x, y, width, height } = h2(id).getBoundingClientRect();
        return { x, y, width, height };
      };
      return { a: r(f), b: r(t) };
    },
    [fromId, toId] as [string, string]
  );
  const [sx, sy] = [a.x + 30, a.y + a.height / 2];
  const [tx, ty] = [b.x + 30, b.y + b.height / 2];
  // Факт захоплення — клас gridstack на картці під час руху.
  await page.evaluate((id) => {
    (window as any).__dragged = false;
    const item = document.querySelector(`.grid-stack-item[gs-id="${id}"]`)!;
    new MutationObserver(() => {
      if (item.classList.contains("ui-draggable-dragging")) (window as any).__dragged = true;
    }).observe(item, { attributes: true, attributeFilter: ["class"] });
  }, fromId as string);
  // Швидко (< 450 мс): довге натискання на картці перемикає режим перестановки.
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 8, sy + ((ty - sy) * i) / 8);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  // 600 мс анімації після жесту + перепакування.
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as any).__dragged), `${fromId}: gridstack не почав перетягування`).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, PERSONAS.manager);
  await page.goto("/manager");
  await expect(page.locator(".mgr-charts.is-ready")).toBeVisible();
  // Скинути розкладку і ввімкнути всі картки — найважчий набір.
  await page.getByRole("button", { name: "Налаштувати картки дашборда" }).click();
  await page.getByRole("button", { name: "Скинути розкладку" }).click();
  for (const box of await page.locator(".mgr-drawer input[type=checkbox]").all()) if (!(await box.isChecked())) await box.check();
  await page.getByRole("button", { name: "Закрити" }).click();
  await page.waitForTimeout(1200);
});

test("усі 13 карток — цеглинки без дір, S/L, без накладань", async ({ page }) => {
  const boxes = await readGrid(page);
  expect(boxes).toHaveLength(13);
  assertBricks(boxes);
});

// TODO(e2e): з усіма 13 картками page.mouse не стартує drag gridstack (з 6 дефолтними — стартує); розібрати окремо.
test.fixme("перестановки в режимі редагування не ламають сітку і не ростять картки", async ({ page }) => {
  await page.getByRole("button", { name: "Переставити картки" }).click();
  await page.waitForTimeout(800);
  const before = await readGrid(page);
  await dragCard(page, "deadlines", "attention");
  assertBricks(await readGrid(page));
  await dragCard(page, "attention", "rings");
  assertBricks(await readGrid(page));
  await dragCard(page, "peopleStatus", "rings");
  const after = await readGrid(page);
  assertBricks(after);
  // Картки на всю ширину (висота по вмісту) не мають «дорости» від хитання.
  for (const n of after.filter((b) => b.w === 12)) {
    const was = before.find((b) => b.id === n.id)!;
    expect(Math.abs(n.px - was.px), `${n.id}: було ${was.px}px, стало ${n.px}px`).toBeLessThanOrEqual(2);
  }
  await page.getByRole("button", { name: "Готово" }).click();

  // Після F5 — та сама цегляна дисципліна.
  // TODO(dashboard): F5 має відновлювати розкладку РІВНО як збережено (правило
  // .claude/rules/manager-dashboard.md), а зараз перепаковує — див. тест нижче.
  await page.reload();
  assertBricks(await readGrid(page));
});

// Знайдено 2026-10-08 (усі 13 карток): збережена розкладка одна й та сама, але
// F5 і повернення 1 → 12 колонок дають РІЗНІ перепакування (матриця
// «люди × курси» переїжджає вгору, ¼-картки — у верхній ряд). Правило
// .claude/rules/manager-dashboard.md обіцяє «як після F5, без перепакування».
test.fixme("повернення з телефонної ширини зберігає розкладку як F5", async ({ page }) => {
  await page.reload();
  const before = await readGrid(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);
  const after = await readGrid(page);
  assertBricks(after);
  const key = (b: Box) => `${b.id}:${b.x},${b.y},${b.w}`;
  expect(after.map(key).sort()).toEqual(before.map(key).sort());
});

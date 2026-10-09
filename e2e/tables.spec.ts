import { test, expect, loginAs, PERSONAS } from "./fixtures";

/** Таблиці «як у Excel» (components/app/TableSizes.tsx): ширина колонки тягнеться за межу заголовка й переживає F5. */
test("ширина колонки тягнеться мишею і зберігається після перезавантаження", async ({ page }) => {
  await loginAs(page, PERSONAS.manager);
  await page.goto("/manager/team");
  const th = page.locator(".mgr-team-table thead th", { hasText: "Людина" });
  await expect(th).toBeVisible();
  const box = (await th.boundingBox())!;
  const before = box.width;
  // Межа — правий край клітинки заголовка (зона 6px).
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 60, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const after = (await th.boundingBox())!.width;
  expect(after - before).toBeGreaterThan(40);

  await page.reload();
  const thAgain = page.locator(".mgr-team-table thead th", { hasText: "Людина" });
  await expect(thAgain).toBeVisible();
  const restored = (await thAgain.boundingBox())!.width;
  expect(restored - before, `було ${before}, після тяги ${after}, після F5 ${restored}`).toBeGreaterThan(40);

  // Скинути подвійним кліком по межі.
  const b2 = (await page.locator(".mgr-team-table thead th", { hasText: "Людина" }).boundingBox())!;
  await page.mouse.dblclick(b2.x + b2.width - 2, b2.y + b2.height / 2);
  await page.evaluate(() => localStorage.removeItem("carls_table_sizes_v1"));
});

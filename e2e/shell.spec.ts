import { test, expect, loginAs, PERSONAS, type Page } from "./fixtures";

/** Капсула нижнього таббару (components/shell/shellCommon.tsx useTabPill) стоїть
 *  рівно під активною вкладкою і ховається на сторінці поза вкладками. */

async function pillMatches(page: Page, tabSelector: string) {
  await expect
    .poll(async () =>
      page.evaluate((sel) => {
        const pill = document.querySelector(".tabbar .tab-pill");
        const tab = document.querySelector(sel);
        if (!pill || !tab || getComputedStyle(pill).opacity === "0") return "hidden";
        const p = pill.getBoundingClientRect();
        const t = tab.getBoundingClientRect();
        return Math.abs(p.left - t.left) < 2 && Math.abs(p.width - t.width) < 2 ? "ok" : `off ${p.left}/${t.left}`;
      }, tabSelector),
    )
    .toBe("ok");
}

async function pillHidden(page: Page) {
  await expect.poll(() => page.locator(".tabbar .tab-pill").evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
}

test.use({ viewport: { width: 390, height: 844 } });

test("хаб: капсула їде за вкладкою і ховається на сповіщеннях", async ({ page }) => {
  await loginAs(page, PERSONAS.employee);
  await page.goto("/hub");
  await pillMatches(page, '.tabbar a[href="/hub"] .tab-btn-indicator');
  await page.locator('.tabbar a[href="/hub/learn"]').click();
  await expect(page).toHaveURL(/\/hub\/learn$/);
  await pillMatches(page, '.tabbar a[href="/hub/learn"] .tab-btn-indicator');
  await page.goto("/hub/notifications");
  await pillHidden(page);
});

test("керівник: «Команда» лишається активною на картці людини", async ({ page }) => {
  await loginAs(page, PERSONAS.manager);
  await page.goto("/manager/team");
  await pillMatches(page, '.tabbar a[href="/manager/team"] .tab-btn-indicator');
  const person = await page.locator('main a[href^="/manager/team/"]').first().getAttribute("href");
  await page.goto(person!);
  await pillMatches(page, '.tabbar a[href="/manager/team"] .tab-btn-indicator');
  await page.goto("/manager/notifications");
  await pillHidden(page);
});

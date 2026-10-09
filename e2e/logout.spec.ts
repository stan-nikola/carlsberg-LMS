import { test, expect, loginAs, PERSONAS } from "./fixtures";

/** Вихід (lib/logoutCleanup.ts): прибирає course_progress_* і сесію, веде на /register. */
test("вихід чистить прогрес курсів на пристрої і сесію", async ({ page }) => {
  await loginAs(page, PERSONAS.manager);
  await page.goto("/manager");
  await page.evaluate(() => localStorage.setItem("course_progress_e2e", JSON.stringify({ idx: 1, answers: {}, key: "x" })));
  await page.locator(".mgr-sidebar button[aria-label=\"Налаштування\"]").click();
  await page.getByRole("button", { name: /Вийти з акаунту/ }).click();
  await page.waitForURL(/\/register/);
  expect(await page.evaluate(() => localStorage.getItem("course_progress_e2e"))).toBeNull();
  await page.goto("/manager");
  await expect(page).toHaveURL(/\/register/);
});

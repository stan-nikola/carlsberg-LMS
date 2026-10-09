import { test, expect, loginAs, PERSONAS } from "./fixtures";

/** Показ — за часом пристрою (lib/localDate.ts, components/ui/LocalDate.tsx),
 *  без розбіжності гідратації з серверною (українською) розміткою. */
test.use({ timezoneId: "Asia/Tokyo" });

test("привітання й дати — за поясом пристрою, без помилок гідратації", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await loginAs(page, PERSONAS.employee);
  await page.goto("/hub");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const expected = hour < 12 ? "ДОБРОГО РАНКУ" : hour < 18 ? "ДОБРОГО ДНЯ" : "ДОБРОГО ВЕЧОРА";
  await expect(page.locator(".hub-greeting-h1")).toHaveText(new RegExp(expected, "i"));
  await page.goto("/hub/learn");
  await expect(page.locator(".ct-due, .ct-completed-date").first()).toBeVisible();
  expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([]);
});

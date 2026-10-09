import { test, expect, loginAdmin, type Page } from "./fixtures";

/** Форми курсу на /admin (спільні поля course-editor/CourseSettingsFields.tsx):
 *  створення з дефолтами нового курсу і збереження налаштувань наявного. */

const TEST_COURSE = "Тестовий курс на 15 модулів";

async function openCourseSettings(page: Page, title: string) {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Список" }).click();
  await page.getByRole("textbox", { name: "Пошук курсу" }).fill(title);
  await page.locator(".admin-course-row", { hasText: title }).first().locator(".admin-course-row-toggle").click();
  return page.locator(".admin-course-row .admin-course-settings").first();
}

test("новий курс створюється з дефолтами і видаляється", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "+ Додати курс" }).click();
  const form = page.locator(".admin-course-settings").first();
  const title = `E2E курс ${Date.now()}`;
  await form.locator("input.admin-input-flex").first().fill(title);

  const created = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/api/admin/courses"));
  await form.getByRole("button", { name: "Створити курс" }).click();
  const res = await created;
  expect(res.ok()).toBeTruthy();
  const body = res.request().postDataJSON();
  expect(body).toMatchObject({ title, isMandatory: true, certificateEnabled: true, passThreshold: 80, previewDevice: "phone", deadlineDays: null });
  expect(Array.isArray(body.streakMessages) && body.streakMessages.length).toBeTruthy();
  const course = await res.json();

  // Прибрати за собою.
  const settings = await openCourseSettings(page, title);
  await expect(settings.locator("input.admin-input-flex").first()).toHaveValue(title);
  page.once("dialog", (d) => d.accept());
  const deleted = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().endsWith(`/api/admin/courses/${course.id}`));
  await settings.getByRole("button", { name: "Видалити курс" }).click();
  expect((await deleted).ok()).toBeTruthy();
});

test("налаштування курсу зберігаються й переживають F5", async ({ page }) => {
  await loginAdmin(page);
  let settings = await openCourseSettings(page, TEST_COURSE);
  const description = settings.locator(".admin-field", { hasText: "Опис" }).locator("input");
  const original = await description.inputValue();

  const save = async (value: string) => {
    await description.fill(value);
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/api\/admin\/courses\/\d+$/.test(r.url()));
    await settings.getByRole("button", { name: "Зберегти налаштування" }).click();
    const res = await saved;
    expect(res.ok()).toBeTruthy();
    expect(res.request().postDataJSON()).toMatchObject({ title: TEST_COURSE, description: value || null });
  };

  await save(`${original} [E2E]`);
  settings = await openCourseSettings(page, TEST_COURSE);
  await expect(description).toHaveValue(`${original} [E2E]`);
  await save(original);
});

test("тап по «ⓘ» у підписі не перемикає галочку", async ({ page }) => {
  await loginAdmin(page);
  const settings = await openCourseSettings(page, TEST_COURSE);
  const label = settings.locator("label.admin-checkbox", { hasText: "Повідомлення за серію" });
  const checkbox = label.locator("input[type=checkbox]");
  const before = await checkbox.isChecked();
  await label.locator(".hint-dot").click();
  expect(await checkbox.isChecked()).toBe(before);
});

import { test as base, expect, type Page } from "@playwright/test";
export type { Page };

/** Демо-персони зі стенду (prisma/seed-synthetic-demo.js). */
export const PERSONAS = {
  manager: "SV0036",
  employee: "SR0107",
} as const;

/** Вхід без PIN через dev-only /api/test/login (404 у production). */
export async function loginAs(page: Page, code: string) {
  const res = await page.request.post("/api/test/login", { data: { code } });
  expect(res.ok(), `test login ${code}: ${res.status()}`).toBeTruthy();
}

export async function loginAdmin(page: Page, level: "admin" | "super" = "admin") {
  const res = await page.request.post("/api/test/login", { data: { admin: level } });
  expect(res.ok(), `admin test login: ${res.status()}`).toBeTruthy();
}

// Оверлей помилок next dev (<nextjs-portal>) перехоплює кліки — ховаємо на кожній сторінці.
export const test = base.extend({
  page: async ({ page }, run) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal{display:none!important}";
        document.head.appendChild(style);
      });
    });
    await run(page);
  },
});
export { expect };

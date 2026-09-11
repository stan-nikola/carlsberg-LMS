import { describe, it, expect, vi } from "vitest";

// isManagerTier не ходить у prisma взагалі (чиста функція над employee.position.level),
// але permissions.js імпортує prisma на верхньому рівні (для getAllSubordinates/
// getDirectReports) — мокаємо порожнім модулем, щоб імпорт не намагався
// реально піднімати PrismaClient без DATABASE_URL у тестовому середовищі
// (той самий прийом, що auth.test.js/slug.test.js).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { isManagerTier } = await import("@/lib/permissions");

// Рівні посад: RM HoReCa=1, ASM/LKAM=2, SV/SV RKA/FSM MT=3 — керівний шар
// для /manager (межа підтверджена користувачем). SR/TECH=4, MR=5 — звичайний /hub.
describe("isManagerTier", () => {
  it("SV (рівень 3) — керівник, межа включно", () => {
    expect(isManagerTier({ position: { level: 3 } })).toBe(true);
  });

  it("ASM (рівень 2) і RM (рівень 1) — керівники", () => {
    expect(isManagerTier({ position: { level: 2 } })).toBe(true);
    expect(isManagerTier({ position: { level: 1 } })).toBe(true);
  });

  it("ТП/Технік (рівень 4) — НЕ керівник, лишається на /hub", () => {
    expect(isManagerTier({ position: { level: 4 } })).toBe(false);
  });

  it("Мерчендайзер (рівень 5) — НЕ керівник", () => {
    expect(isManagerTier({ position: { level: 5 } })).toBe(false);
  });

  it("без посади (position: null) — не керівник, не падає", () => {
    expect(isManagerTier({ position: null })).toBe(false);
  });

  it("без employee (null/undefined) — не керівник, не падає", () => {
    expect(isManagerTier(null)).toBe(false);
    expect(isManagerTier(undefined)).toBe(false);
  });
});

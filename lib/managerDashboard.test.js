import { describe, it, expect, vi } from "vitest";

// getDashboardStats ходить лише в prisma.enrollment.findMany — мокаємо
// саме цей виклик, той самий прийом, що auth.test.js/slug.test.js.
const enrollmentFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { enrollment: { findMany: (...args) => enrollmentFindMany(...args) } },
}));
vi.mock("@/lib/permissions", () => ({ getDirectReports: vi.fn() }));

const { getDashboardStats } = await import("@/lib/managerDashboard");

// Реальний баг, знайдений користувачем: "Вчасно 100%" одночасно з
// реальними простроченими в команді — onTimeRate рахував знаменник лише
// по ЗАВЕРШЕНИХ enrollments, прострочені (за визначенням НЕ вчасно)
// туди взагалі не потрапляли.
describe("getDashboardStats — onTimeRate враховує прострочені", () => {
  it("прострочений enrollment знижує onTimeRate, а не ігнорується", async () => {
    enrollmentFindMany.mockResolvedValue([
      // Завершено вчасно.
      {
        status: "completed",
        scorePercent: 90,
        passed: true,
        employeeId: 1,
        dueDate: new Date("2026-01-10"),
        completedAt: new Date("2026-01-05"),
        course: { id: 1, title: "Курс A" },
      },
      // Прострочено — дедлайн минув, so НЕ вчасно, попри те, що completed тут нема.
      {
        status: "overdue",
        scorePercent: null,
        passed: null,
        employeeId: 2,
        dueDate: new Date("2026-01-01"),
        completedAt: null,
        course: { id: 1, title: "Курс A" },
      },
    ]);

    const stats = await getDashboardStats([1, 2]);

    // 1 вчасно з 2 "вирішених" дедлайнів (1 завершено вчасно + 1 прострочено) = 50%,
    // НЕ 100% (як було до фіксу, коли прострочений просто не рахувався).
    expect(stats.onTimeRate).toBe(50);
    expect(stats.overdueCount).toBe(1);
  });

  it("100% лише коли справді немає жодного простроченого", async () => {
    enrollmentFindMany.mockResolvedValue([
      {
        status: "completed",
        scorePercent: 90,
        passed: true,
        employeeId: 1,
        dueDate: new Date("2026-01-10"),
        completedAt: new Date("2026-01-05"),
        course: { id: 1, title: "Курс A" },
      },
    ]);

    const stats = await getDashboardStats([1]);
    expect(stats.onTimeRate).toBe(100);
    expect(stats.overdueCount).toBe(0);
  });
});

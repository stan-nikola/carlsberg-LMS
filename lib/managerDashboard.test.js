import { describe, it, expect, vi } from "vitest";

// getDashboardStats ходить у три таблиці (призначення + завершення
// модулів + спроби) — мокаємо всі три, той самий прийом, що
// auth.test.js/slug.test.js. Два останні за замовчуванням порожні: тести
// нижче, яким вони не потрібні, не мусять їх щоразу оголошувати.
const enrollmentFindMany = vi.fn();
const moduleCompletionFindMany = vi.fn(async () => []);
const attemptFindMany = vi.fn(async () => []);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: { findMany: (...args) => enrollmentFindMany(...args) },
    moduleCompletion: { findMany: (...args) => moduleCompletionFindMany(...args) },
    enrollmentAttempt: { findMany: (...args) => attemptFindMany(...args) },
  },
}));

const {
  getDashboardStats,
  bucketDeadlineHorizon,
  bucketScores,
  rankHardestModules,
  computeFirstAttempt,
  bucketDurations,
} = await import("@/lib/managerDashboard");

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

describe("bucketDeadlineHorizon", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const at = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const countOf = (buckets, key) => buckets.find((b) => b.key === key).count;

  it("розкладає незавершені по горизонту дедлайну", () => {
    const buckets = bucketDeadlineHorizon(
      [
        { status: "in_progress", dueDate: at(3) },
        { status: "not_started", dueDate: at(20) },
        { status: "in_progress", dueDate: at(45) },
        { status: "not_started", dueDate: null },
      ],
      now,
    );

    expect(countOf(buckets, "week")).toBe(1);
    expect(countOf(buckets, "month")).toBe(1);
    expect(countOf(buckets, "later")).toBe(1);
    expect(countOf(buckets, "none")).toBe(1);
  });

  it("завершені не потрапляють у горизонт — їхній дедлайн уже не актуальний", () => {
    const buckets = bucketDeadlineHorizon([{ status: "completed", dueDate: at(5) }], now);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  // Між запусками щоденного cron дедлайн може минути, а статус лишитись
  // in_progress — такий рядок мусить рахуватись простроченим, інакше
  // "до 7 днів" тихо ховало б уже прострочене.
  it("минулий дедлайн — прострочено навіть якщо статус ще не overdue", () => {
    const buckets = bucketDeadlineHorizon([{ status: "in_progress", dueDate: at(-2) }], now);
    expect(countOf(buckets, "overdue")).toBe(1);
    expect(countOf(buckets, "week")).toBe(0);
  });
});

describe("bucketScores", () => {
  it("рахує лише завершені з відомим балом", () => {
    const buckets = bucketScores([
      { status: "completed", scorePercent: 55 },
      { status: "completed", scorePercent: 79 },
      { status: "completed", scorePercent: 80 },
      { status: "completed", scorePercent: 99 },
      { status: "completed", scorePercent: 100 },
      { status: "completed", scorePercent: null }, // завершено без балу — не рахуємо
      { status: "in_progress", scorePercent: 90 }, // ще не завершено
    ]);

    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("rankHardestModules", () => {
  const mc = (moduleId, passed, title) => ({ moduleId, passed, module: { title, course: { title: "Курс A" } } });

  // Ранжування за абсолютною кількістю провалів, а не за відсотком:
  // "1 з 1" дало б 100% і витіснило б "3 з 8", хоча діяти треба по
  // другому.
  it("сортує за кількістю провалів, не за відсотком", () => {
    const ranked = rankHardestModules([
      mc(1, false, "Рідкісний"),
      mc(2, false, "Масовий"),
      mc(2, false, "Масовий"),
      mc(2, false, "Масовий"),
      mc(2, true, "Масовий"),
    ]);

    expect(ranked[0].title).toBe("Масовий");
    expect(ranked[0].failed).toBe(3);
    expect(ranked[0].pct).toBe(75);
    expect(ranked[1].title).toBe("Рідкісний");
  });

  it("модулі без жодного провалу в список не потрапляють", () => {
    expect(rankHardestModules([mc(1, true, "Легкий")])).toEqual([]);
  });
});

describe("computeFirstAttempt", () => {
  it("рахує саме ПЕРШУ спробу кожного призначення", () => {
    const result = computeFirstAttempt([
      // Провалив першу, склав другу — у знаменнику, але не в чисельнику.
      { enrollmentId: 1, completedAt: new Date("2026-02-01"), passed: false },
      { enrollmentId: 1, completedAt: new Date("2026-02-05"), passed: true },
      // Склав одразу.
      { enrollmentId: 2, completedAt: new Date("2026-02-03"), passed: true },
    ]);

    expect(result.total).toBe(2);
    expect(result.passedFirst).toBe(1);
    expect(result.retried).toBe(1);
    expect(result.pct).toBe(50);
  });

  it("без жодної спроби — 0, а не ділення на нуль", () => {
    expect(computeFirstAttempt([])).toEqual({ total: 0, passedFirst: 0, retried: 0, pct: 0 });
  });
});

describe("bucketDurations", () => {
  const min = (m) => m * 60;

  it("розкладає спроби по корзинах часу", () => {
    const { buckets, total } = bucketDurations([
      { durationSeconds: min(5), activeTimeSeconds: min(4) },
      { durationSeconds: min(15), activeTimeSeconds: min(12) },
      { durationSeconds: min(30), activeTimeSeconds: min(25) },
      { durationSeconds: min(90), activeTimeSeconds: min(20) },
    ]);

    expect(total).toBe(4);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  });

  // Ключова причина брати медіану, а не середнє: одна забута відкритою
  // вкладка на кілька годин не мусить описувати всю команду.
  it("медіана стійка до одного аномально довгого запису", () => {
    const { medianSeconds } = bucketDurations([
      { durationSeconds: min(10), activeTimeSeconds: null },
      { durationSeconds: min(12), activeTimeSeconds: null },
      { durationSeconds: min(14), activeTimeSeconds: null },
      { durationSeconds: min(600), activeTimeSeconds: null },
    ]);

    // Медіана двох середніх (12 і 14 хв) = 13 хв. Середнє тут було б
    // ~159 хв — число, якого не має жодна реальна спроба.
    expect(medianSeconds).toBe(min(13));
  });

  it("спроби без виміряного часу ігноруються, а не рахуються як 0", () => {
    const { total, medianSeconds } = bucketDurations([
      { durationSeconds: null, activeTimeSeconds: null },
      { durationSeconds: 0, activeTimeSeconds: null },
    ]);

    expect(total).toBe(0);
    expect(medianSeconds).toBeNull();
  });
});

describe("rankHardestModules — середня кількість спроб", () => {
  const mod = (moduleId, passed, attemptCount) => ({
    moduleId,
    passed,
    attemptCount,
    module: { title: `Модуль ${moduleId}`, course: { title: "Курс" } },
  });

  it("рахує середнє по людях, а не по спробах", () => {
    const rows = [mod(1, false, 3), mod(1, true, 1)];
    const [m] = rankHardestModules(rows);
    expect(m.total).toBe(2);
    expect(m.failed).toBe(1);
    expect(m.avgAttempts).toBe(2);
  });

  it("округлює до одного знака", () => {
    const rows = [mod(1, false, 2), mod(1, true, 1), mod(1, true, 1)];
    expect(rankHardestModules(rows)[0].avgAttempts).toBe(1.3);
  });

  it("відсутній лічильник рахується як одна спроба", () => {
    const rows = [mod(1, false, null), mod(1, true, null)];
    expect(rankHardestModules(rows)[0].avgAttempts).toBe(1);
  });
});

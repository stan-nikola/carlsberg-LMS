import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const updateMany = vi.fn(async (_arg: unknown) => ({ count: 0 }));
vi.mock("@/lib/prisma", () => ({ prisma: { enrollment: { findMany: (...a: unknown[]) => findMany(...a), updateMany: (a: unknown) => updateMany(a) } } }));

const notifyEmployees = vi.fn(async (ids: number[], _event: unknown) => ({ created: ids.length }));
vi.mock("@/lib/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...actual, notifyEmployees: (...a: [number[], unknown]) => notifyEmployees(...a) };
});

const { markOverdueEnrollments } = await import("./overdueEnrollments");
const { notifyEachLimited } = await import("./notifications");

type Event = { message: string; dedupeKey: (id: number) => string };

describe("markOverdueEnrollments — групи замість запиту на людину", () => {
  beforeEach(() => {
    notifyEmployees.mockClear();
    updateMany.mockClear();
  });

  it("один виклик на курс+дедлайн, керівникам — по одному, статус — updateMany на групу", async () => {
    const due = new Date("2026-09-30T10:00:00Z");
    findMany.mockResolvedValue([
      { id: 11, employeeId: 1, courseId: 7, dueDate: due, employee: { name: "Ольга", managerId: 100 }, course: { title: "Пиво", slug: "pyvo" } },
      { id: 12, employeeId: 2, courseId: 7, dueDate: due, employee: { name: "Петро", managerId: null }, course: { title: "Пиво", slug: "pyvo" } },
      { id: 21, employeeId: 1, courseId: 8, dueDate: due, employee: { name: "Ольга", managerId: 100 }, course: { title: "Сервіс", slug: "servis" } },
    ]);

    const res = await markOverdueEnrollments();

    const own = notifyEmployees.mock.calls.filter(([, e]) => (e as Event).message.startsWith("Курс"));
    expect(own).toHaveLength(2);
    const [ids, event] = own[0] as [number[], Event];
    expect(ids).toEqual([1, 2]);
    // Ключ дедуплікації — свій у кожної людини, як і раніше.
    expect(event.dedupeKey(1)).toBe("overdue:11");
    expect(event.dedupeKey(2)).toBe("overdue:12");

    const managers = notifyEmployees.mock.calls.filter(([, e]) => (e as Event).message.startsWith("У "));
    expect(managers.map(([ids]) => ids)).toEqual([[100], [100]]);
    expect(managers.map(([, e]) => (e as Event).dedupeKey(100))).toEqual(["overdue:11:manager", "overdue:21:manager"]);

    expect(updateMany.mock.calls.map(([arg]) => (arg as { where: { id: { in: number[] } } }).where.id.in)).toEqual([[11, 12], [21]]);
    expect(res).toEqual({ markedCount: 3, notifiedCount: 3 + 2 });
  });
});

describe("notifyEachLimited", () => {
  it("не більше limit одночасно і сума created", async () => {
    let running = 0;
    let peak = 0;
    const total = await notifyEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { created: 1 };
    });
    expect(total).toBe(7);
    expect(peak).toBe(3);
  });
});

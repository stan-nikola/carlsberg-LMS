import { describe, it, expect, vi } from "vitest";

// getCourseForPlayer/getEnrollmentForCourse у цьому файлі теж є, і вони
// імпортують "@/lib/prisma" (реальний Prisma-клієнт з підключенням до БД)
// на рівні модуля — тож без мока prisma сам імпорт файлу впаде. Тестуємо
// тут лише чисту логіку (computeModuleAvailability), тому мокаємо prisma
// пустим об'єктом, аби модуль взагалі підвантажився.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { computeModuleAvailability } = await import("@/lib/courseContent");

function courseModule(id, cooldownDays = null) {
  return { id, cooldownDays };
}

describe("computeModuleAvailability", () => {
  it("перший модуль курсу завжди доступний, навіть без жодного ModuleCompletion", () => {
    const course = { modules: [courseModule(1), courseModule(2)] };
    const result = computeModuleAvailability(course, new Map());

    expect(result.get(1)).toEqual({ available: true, unlocksAt: null, waitingForPrevious: false });
  });

  it("наступний модуль заблокований, якщо попередній ще не складено взагалі", () => {
    const course = { modules: [courseModule(1), courseModule(2)] };
    const result = computeModuleAvailability(course, new Map());

    expect(result.get(2)).toEqual({ available: false, unlocksAt: null, waitingForPrevious: true });
  });

  it("наступний модуль заблокований, якщо попередній складено, але passed=false (не набрав 80%)", () => {
    const course = { modules: [courseModule(1), courseModule(2)] };
    const completions = new Map([[1, { passed: false, completedAt: new Date() }]]);
    const result = computeModuleAvailability(course, completions);

    expect(result.get(2)).toEqual({ available: false, unlocksAt: null, waitingForPrevious: true });
  });

  it("без cooldownDays наступний модуль відкривається одразу після passed=true", () => {
    const course = { modules: [courseModule(1), courseModule(2, null)] };
    const completions = new Map([[1, { passed: true, completedAt: new Date() }]]);
    const result = computeModuleAvailability(course, completions);

    expect(result.get(2)).toEqual({ available: true, unlocksAt: null, waitingForPrevious: false });
  });

  it("з cooldownDays модуль лишається заблокованим, поки пауза не минула", () => {
    const course = { modules: [courseModule(1), courseModule(2, 3)] };
    const completedAt = new Date(); // складено щойно, пауза 3 дні ще не минула
    const completions = new Map([[1, { passed: true, completedAt }]]);
    const result = computeModuleAvailability(course, completions);

    const entry = result.get(2);
    expect(entry.available).toBe(false);
    expect(entry.waitingForPrevious).toBe(false); // саме "чекає паузу", не "чекає складання"
    expect(entry.unlocksAt).toBeInstanceOf(Date);
    expect(entry.unlocksAt.getTime()).toBeGreaterThan(completedAt.getTime());
  });

  it("з cooldownDays модуль відкривається одразу, як пауза минула", () => {
    const course = { modules: [courseModule(1), courseModule(2, 3)] };
    const completedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 дні тому, пауза 3 дні
    const completions = new Map([[1, { passed: true, completedAt }]]);
    const result = computeModuleAvailability(course, completions);

    expect(result.get(2)).toEqual({ available: true, unlocksAt: null, waitingForPrevious: false });
  });

  it("ланцюжок із 3 модулів: другий блокує третій незалежно від стану першого", () => {
    const course = { modules: [courseModule(1), courseModule(2), courseModule(3)] };
    const completions = new Map([
      [1, { passed: true, completedAt: new Date() }],
      // модуль 2 ще не складено
    ]);
    const result = computeModuleAvailability(course, completions);

    expect(result.get(1).available).toBe(true);
    expect(result.get(2).available).toBe(true); // передумова (модуль 1) складена
    expect(result.get(3)).toEqual({ available: false, unlocksAt: null, waitingForPrevious: true });
  });
});

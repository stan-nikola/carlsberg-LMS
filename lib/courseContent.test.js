import { describe, it, expect, vi } from "vitest";

// getCourseForPlayer/getEnrollmentForCourse у цьому файлі теж є, і вони
// імпортують "@/lib/prisma" (реальний Prisma-клієнт з підключенням до БД)
// на рівні модуля — тож без мока prisma сам імпорт файлу впаде. Тестуємо
// тут лише чисту логіку (computeBlockAvailability), тому мокаємо prisma
// пустим об'єктом, аби модуль взагалі підвантажився.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { computeBlockAvailability } = await import("@/lib/courseContent");

function block(id, cooldownDays = null) {
  return { id, cooldownDays };
}

describe("computeBlockAvailability", () => {
  it("перший блок курсу завжди доступний, навіть без жодного BlockCompletion", () => {
    const course = { blocks: [block(1), block(2)] };
    const result = computeBlockAvailability(course, new Map());

    expect(result.get(1)).toEqual({ available: true, unlocksAt: null, waitingForPrevious: false });
  });

  it("наступний блок заблокований, якщо попередній ще не складено взагалі", () => {
    const course = { blocks: [block(1), block(2)] };
    const result = computeBlockAvailability(course, new Map());

    expect(result.get(2)).toEqual({ available: false, unlocksAt: null, waitingForPrevious: true });
  });

  it("наступний блок заблокований, якщо попередній складено, але passed=false (не набрав 80%)", () => {
    const course = { blocks: [block(1), block(2)] };
    const completions = new Map([[1, { passed: false, completedAt: new Date() }]]);
    const result = computeBlockAvailability(course, completions);

    expect(result.get(2)).toEqual({ available: false, unlocksAt: null, waitingForPrevious: true });
  });

  it("без cooldownDays наступний блок відкривається одразу після passed=true", () => {
    const course = { blocks: [block(1), block(2, null)] };
    const completions = new Map([[1, { passed: true, completedAt: new Date() }]]);
    const result = computeBlockAvailability(course, completions);

    expect(result.get(2)).toEqual({ available: true, unlocksAt: null, waitingForPrevious: false });
  });

  it("з cooldownDays блок лишається заблокованим, поки пауза не минула", () => {
    const course = { blocks: [block(1), block(2, 3)] };
    const completedAt = new Date(); // складено щойно, пауза 3 дні ще не минула
    const completions = new Map([[1, { passed: true, completedAt }]]);
    const result = computeBlockAvailability(course, completions);

    const entry = result.get(2);
    expect(entry.available).toBe(false);
    expect(entry.waitingForPrevious).toBe(false); // саме "чекає паузу", не "чекає складання"
    expect(entry.unlocksAt).toBeInstanceOf(Date);
    expect(entry.unlocksAt.getTime()).toBeGreaterThan(completedAt.getTime());
  });

  it("з cooldownDays блок відкривається одразу, як пауза минула", () => {
    const course = { blocks: [block(1), block(2, 3)] };
    const completedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 дні тому, пауза 3 дні
    const completions = new Map([[1, { passed: true, completedAt }]]);
    const result = computeBlockAvailability(course, completions);

    expect(result.get(2)).toEqual({ available: true, unlocksAt: null, waitingForPrevious: false });
  });

  it("ланцюжок із 3 блоків: другий блокує третій незалежно від стану першого", () => {
    const course = { blocks: [block(1), block(2), block(3)] };
    const completions = new Map([
      [1, { passed: true, completedAt: new Date() }],
      // блок 2 ще не складено
    ]);
    const result = computeBlockAvailability(course, completions);

    expect(result.get(1).available).toBe(true);
    expect(result.get(2).available).toBe(true); // передумова (блок 1) складена
    expect(result.get(3)).toEqual({ available: false, unlocksAt: null, waitingForPrevious: true });
  });
});

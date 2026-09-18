import { describe, it, expect, vi } from "vitest";

// getCourseForPlayer/getEnrollmentForCourse у цьому файлі теж є, і вони
// імпортують "@/lib/prisma" (реальний Prisma-клієнт з підключенням до БД)
// на рівні модуля — тож без мока prisma сам імпорт файлу впаде. Тестуємо
// тут лише чисту логіку (computeModuleAvailability), тому мокаємо prisma
// пустим об'єктом, аби модуль взагалі підвантажився.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { computeModuleAvailability, getSessionModules } = await import("@/lib/courseContent");

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

describe("getSessionModules", () => {
  const course = {
    modules: [
      { id: 1, cooldownDays: null, retakeCooldownDays: null },
      { id: 2, cooldownDays: null, retakeCooldownDays: null },
      { id: 3, cooldownDays: 2, retakeCooldownDays: null },
      { id: 4, cooldownDays: null, retakeCooldownDays: null },
    ],
  };
  const now = new Date("2026-09-15T12:00:00Z");

  it("перше відкриття: модулі без паузи йдуть ланцюжком, на модулі з паузою сесія зупиняється", () => {
    const r = getSessionModules(course, new Map(), now);
    expect(r.playable.map((m) => m.id)).toEqual([1, 2]);
    expect(r.nextLocked).toMatchObject({ module: { id: 3 }, reason: "pause" });
  });

  it("після складання 2-го: 3-й закритий паузою до дати, 4-й не досяжний", () => {
    const done = (d) => ({ passed: true, completedAt: new Date(d) });
    const r = getSessionModules(course, new Map([[1, done("2026-09-14")], [2, done("2026-09-14")]]), now);
    expect(r.playable).toEqual([]);
    expect(r.nextLocked).toMatchObject({ module: { id: 3 }, reason: "cooldown" });
    expect(r.nextLocked.unlocksAt.toISOString().slice(0, 10)).toBe("2026-09-16");
  });

  it("пауза (1 день) минула, а пауза перепроходження (2 дні) ще ні: 3-й і 4-й граються, складені 1-2 пропускаються", () => {
    const done = (d) => ({ passed: true, completedAt: new Date(d) });
    const shortPause = { modules: course.modules.map((m) => (m.id === 3 ? { ...m, cooldownDays: 1 } : m)) };
    const r = getSessionModules(shortPause, new Map([[1, done("2026-09-13T13:00:00Z")], [2, done("2026-09-13T13:00:00Z")]]), now);
    expect(r.playable.map((m) => m.id)).toEqual([3, 4]);
    expect(r.nextLocked).toBeNull();
  });

  it("пауза перепроходження минула — складені модулі знову в сесії разом з наступними", () => {
    const done = (d) => ({ passed: true, completedAt: new Date(d) });
    const r = getSessionModules(course, new Map([[1, done("2026-09-10")], [2, done("2026-09-10")]]), now);
    expect(r.playable.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("провалений модуль перепроходиться одразу, далі за ним не пускає", () => {
    const r = getSessionModules(course, new Map([[1, { passed: false, completedAt: new Date("2026-09-14") }]]), now);
    expect(r.playable.map((m) => m.id)).toEqual([1, 2]);
  });

  it("складений на 100% модуль НЕ повертається в сесію, навіть якщо retakeCooldownDays=0 (перепроходити нічого)", () => {
    const withInstantRetake = {
      modules: course.modules.map((m) => (m.id === 1 ? { ...m, retakeCooldownDays: 0 } : m)),
    };
    const r = getSessionModules(
      withInstantRetake,
      new Map([[1, { passed: true, completedAt: new Date("2026-09-10"), scorePercent: 100 }]]),
      now
    );
    // Модуль 1 (100%) пропускається, 2-й — уже вперше, продовжує сесію.
    expect(r.playable.map((m) => m.id)).toEqual([2]);
  });

  it("складений НЕ на 100% модуль лишається у сесії з retakeCooldownDays=0 (є що покращити)", () => {
    const withInstantRetake = {
      modules: course.modules.map((m) => (m.id === 1 ? { ...m, retakeCooldownDays: 0 } : m)),
    };
    const r = getSessionModules(
      withInstantRetake,
      new Map([[1, { passed: true, completedAt: new Date("2026-09-10"), scorePercent: 80 }]]),
      now
    );
    expect(r.playable.map((m) => m.id)).toEqual([1, 2]);
  });
});

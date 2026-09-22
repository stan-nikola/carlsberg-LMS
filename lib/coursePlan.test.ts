import { describe, expect, it } from "vitest";
import {
  buildCoursePlan,
  formatMinutes,
  pickPlanFocusModuleId,
  pluralDays,
  toPlanView,
  type PlanCompletion,
  type PlanModuleInput,
} from "./coursePlan";

const NOW = new Date("2026-09-17T09:00:00Z");

function mod(over: Partial<PlanModuleInput> & { id: number }): PlanModuleInput {
  return {
    title: `Модуль ${over.id}`,
    order: over.id,
    cooldownDays: null,
    retakeCooldownDays: null,
    componentCount: 8,
    ...over,
  };
}

function done(over: Partial<PlanCompletion> & { moduleId: number }): PlanCompletion {
  return { passed: true, scorePercent: 100, completedAt: new Date("2026-09-10T09:00:00Z"), ...over };
}

const NO_DATES = { assignedAt: null, dueDate: null };

describe("buildCoursePlan — доступність модулів", () => {
  it("перший модуль доступний завжди, решта чекає на складання попереднього", () => {
    const plan = buildCoursePlan([mod({ id: 1 }), mod({ id: 2 })], [], NO_DATES, NOW);
    expect(plan.modules[0].canPlay).toBe(true);
    expect(plan.modules[1].canPlay).toBe(false);
    expect(plan.modules[1].waitingForPrevious).toBe(true);
    expect(plan.nextModuleId).toBe(1);
  });

  it("наступний модуль відкривається датою, коли попередній складено і йде пауза", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2, cooldownDays: 3 })],
      [done({ moduleId: 1, completedAt: new Date("2026-09-16T09:00:00Z") })],
      NO_DATES,
      NOW
    );
    expect(plan.modules[1].canPlay).toBe(false);
    expect(plan.modules[1].unlocksAt).toEqual(new Date("2026-09-19T09:00:00Z"));
    expect(plan.modules[1].waitingForPrevious).toBe(false);
  });

  it("коли пауза минула, дата відкриття не показується — модуль просто доступний", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2, cooldownDays: 3 })],
      [done({ moduleId: 1, completedAt: new Date("2026-09-01T09:00:00Z") })],
      NO_DATES,
      NOW
    );
    expect(plan.modules[1].canPlay).toBe(true);
    expect(plan.modules[1].unlocksAt).toBeNull();
  });

  it("для модуля за незакритим попередником дати немає — лише умова в днях", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3, cooldownDays: 5 })],
      [],
      NO_DATES,
      NOW
    );
    expect(plan.modules[2].unlocksAt).toBeNull();
    expect(plan.modules[2].unlockAfterDays).toBe(5);
  });

  it("провалений модуль перепроходиться одразу і лишається наступним", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1, passed: false, scorePercent: 40, completedAt: NOW })],
      NO_DATES,
      NOW
    );
    expect(plan.modules[0].status).toBe("failed");
    expect(plan.modules[0].canPlay).toBe(true);
    expect(plan.nextModuleId).toBe(1);
    expect(plan.modules[1].canPlay).toBe(false);
  });
});

describe("buildCoursePlan — перепроходження", () => {
  it("складений на 100% не перепроходиться", () => {
    const plan = buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1, scorePercent: 100 })], NO_DATES, NOW);
    expect(plan.modules[0].canRetake).toBe(false);
    expect(plan.modules[0].canPlay).toBe(false);
  });

  it("складений нижче 100% перепроходиться після паузи", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1, retakeCooldownDays: 2 })],
      [done({ moduleId: 1, scorePercent: 85, completedAt: new Date("2026-09-01T09:00:00Z") })],
      NO_DATES,
      NOW
    );
    expect(plan.modules[0].canRetake).toBe(true);
    expect(plan.modules[0].canPlay).toBe(true);
  });

  it("складений нижче 100% під паузою показує дату, коли її буде знято", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1, retakeCooldownDays: 2 })],
      [done({ moduleId: 1, scorePercent: 85, completedAt: new Date("2026-09-16T09:00:00Z") })],
      NO_DATES,
      NOW
    );
    expect(plan.modules[0].canRetake).toBe(false);
    expect(plan.modules[0].retakeAvailableAt).toEqual(new Date("2026-09-18T09:00:00Z"));
  });

  it("складений модуль не стає наступним — навчання йде далі по курсу", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1, retakeCooldownDays: 0 }), mod({ id: 2 })],
      [done({ moduleId: 1, scorePercent: 85 })],
      NO_DATES,
      NOW
    );
    expect(plan.modules[0].canRetake).toBe(true);
    expect(plan.nextModuleId).toBe(2);
  });
});

describe("buildCoursePlan — час і темп", () => {
  it("рахує час усього курсу і окремо залишку", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1, componentCount: 8 }), mod({ id: 2, componentCount: 16 })],
      [done({ moduleId: 1 })],
      NO_DATES,
      NOW
    );
    expect(plan.totalMinutes).toBe(18); // 6 + 12
    expect(plan.remainingMinutes).toBe(12);
    expect(plan.passedCount).toBe(1);
    expect(plan.remainingCount).toBe(1);
  });

  it("без дедлайну темпу немає", () => {
    const plan = buildCoursePlan([mod({ id: 1 })], [], NO_DATES, NOW);
    expect(plan.pace).toBeNull();
  });

  it("рахує скільки модулів на тиждень треба, щоб встигнути", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3 }), mod({ id: 4 })],
      [],
      { assignedAt: NOW, dueDate: new Date("2026-10-01T09:00:00Z") },
      NOW
    );
    expect(plan.pace?.daysLeft).toBe(14);
    expect(plan.pace?.modulesPerWeek).toBe(2);
    expect(plan.pace?.overdue).toBe(false);
  });

  it("прострочений курс позначається, а весь залишок падає на поточний тиждень", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [],
      { assignedAt: NOW, dueDate: new Date("2026-09-14T09:00:00Z") },
      NOW
    );
    expect(plan.pace?.overdue).toBe(true);
    expect(plan.pace?.modulesPerWeek).toBe(2);
  });

  it("позначає дедлайн, недосяжний через суму пауз між модулями", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2, cooldownDays: 7 }), mod({ id: 3, cooldownDays: 7 })],
      [],
      { assignedAt: NOW, dueDate: new Date("2026-09-20T09:00:00Z") },
      NOW
    );
    expect(plan.pace?.blockedByCooldowns).toBe(true);
  });

  it("не позначає недосяжність, коли пауз вистачає часу", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2, cooldownDays: 2 })],
      [],
      { assignedAt: NOW, dueDate: new Date("2026-10-01T09:00:00Z") },
      NOW
    );
    expect(plan.pace?.blockedByCooldowns).toBe(false);
  });

  it("усе складено — наступного модуля немає", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1 }), done({ moduleId: 2 })],
      NO_DATES,
      NOW
    );
    expect(plan.nextModuleId).toBeNull();
    expect(plan.remainingCount).toBe(0);
  });
});

describe("toPlanView — підписи для показу", () => {
  it("складений модуль показує бал, дату і не пропонує дію при 100%", () => {
    const view = toPlanView(
      buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1, scorePercent: 100 })], NO_DATES, NOW)
    );
    expect(view.modules[0].scoreLabel).toBe("100%");
    expect(view.modules[0].completedAtLabel).toBe("10.09.2026");
    expect(view.modules[0].actionLabel).toBeNull();
    expect(view.modules[0].lockLabel).toBeNull();
  });

  it("складений між прохідним порогом і 99% (пауза вже минула) пропонує покращити результат", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1, retakeCooldownDays: 2 })],
        [done({ moduleId: 1, scorePercent: 85, completedAt: new Date("2026-09-01T09:00:00Z") })],
        NO_DATES,
        NOW
      )
    );
    expect(view.modules[0].status).toBe("passed");
    expect(view.modules[0].actionLabel).toBe("Покращити результат");
    expect(view.modules[0].retakeLabel).toBeNull(); // дія вже доступна — дублювати датою нема сенсу
  });

  it("складений між прохідним порогом і 99% під паузою перепроходження — дія відсутня, дата є", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1, retakeCooldownDays: 2 })],
        [done({ moduleId: 1, scorePercent: 85, completedAt: new Date("2026-09-16T09:00:00Z") })],
        NO_DATES,
        NOW
      )
    );
    expect(view.modules[0].status).toBe("passed");
    expect(view.modules[0].actionLabel).toBeNull();
    expect(view.modules[0].retakeLabel).toBe("Перепройти можна з 18.09.2026");
  });

  it("заблокований модуль пояснює умову, а не вигадує дату", () => {
    const view = toPlanView(
      buildCoursePlan([mod({ id: 1 }), mod({ id: 2, cooldownDays: 3 })], [], NO_DATES, NOW)
    );
    expect(view.modules[1].lockLabel).toBe("Через 3 дні після попереднього");
    expect(view.modules[1].lockKind).toBe("days");
  });

  it("модуль під паузою показує точну дату відкриття", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1 }), mod({ id: 2, cooldownDays: 3 })],
        [done({ moduleId: 1, completedAt: new Date("2026-09-16T09:00:00Z") })],
        NO_DATES,
        NOW
      )
    );
    expect(view.modules[1].lockLabel).toBe("Відкриється 19.09.2026");
  });

  it("темп рахується в модулях на тиждень", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3 }), mod({ id: 4 })],
        [],
        { assignedAt: NOW, dueDate: new Date("2026-10-01T09:00:00Z") },
        NOW
      )
    );
    expect(view.paceLabel).toBe("Щоб встигнути: 2 модулі на тиждень · ще 24 хв");
    expect(view.overdue).toBe(false);
  });

  it("без дедлайну каже про власний темп", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 })], [], NO_DATES, NOW));
    expect(view.paceLabel).toBe("Без дедлайну — проходьте у власному темпі · ще 6 хв");
  });

  it("відмінює дні: 1 день, 3 дні, 11 днів", () => {
    expect(pluralDays(1)).toBe("день");
    expect(pluralDays(3)).toBe("дні");
    expect(pluralDays(11)).toBe("днів");
    expect(pluralDays(21)).toBe("день");
  });

  it("час понад годину показується як год + хв", () => {
    expect(formatMinutes(45)).toBe("45 хв");
    expect(formatMinutes(75)).toBe("1 год 15 хв");
    expect(formatMinutes(120)).toBe("2 год");
  });
});

describe("buildCoursePlan — темп курсу з конструктора", () => {
  const ASSIGNED = new Date("2026-09-10T09:00:00Z");
  const PACING = { moduleDays: 7, pauseDays: 3 };

  it("рекомендована дата k-го модуля — призначення + k × moduleDays", () => {
    const plan = buildCoursePlan([mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3 })], [], { assignedAt: ASSIGNED, dueDate: null }, NOW, PACING);
    expect(plan.modules[0].targetDate).toEqual(new Date("2026-09-17T09:00:00Z"));
    expect(plan.modules[2].targetDate).toEqual(new Date("2026-10-01T09:00:00Z"));
  });

  it("пауза курсу застосовується до модулів без власної, власна має пріоритет", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3, cooldownDays: 10 })],
      [],
      { assignedAt: ASSIGNED, dueDate: null },
      NOW,
      PACING
    );
    expect(plan.modules[1].unlockAfterDays).toBe(3);
    expect(plan.modules[2].unlockAfterDays).toBe(10);
  });

  it("власна пауза 0 у модуля перекриває паузу курсу (не падає в дефолт)", () => {
    const plan = buildCoursePlan([mod({ id: 1 }), mod({ id: 2, cooldownDays: 0 })], [], { assignedAt: ASSIGNED, dueDate: null }, NOW, PACING);
    expect(plan.modules[1].unlockAfterDays).toBeNull();
  });

  it("дата відкриття рахується від складання попереднього + пауза курсу", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1, completedAt: new Date("2026-09-16T09:00:00Z") })],
      { assignedAt: ASSIGNED, dueDate: null },
      NOW,
      PACING
    );
    expect(plan.modules[1].unlocksAt).toEqual(new Date("2026-09-19T09:00:00Z"));
  });

  it("за графіком: до сьогодні мав бути складений 1 модуль, і він складений", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3 })],
      [done({ moduleId: 1, completedAt: new Date("2026-09-15T09:00:00Z") })],
      { assignedAt: ASSIGNED, dueDate: null },
      NOW,
      PACING
    );
    expect(plan.schedule?.status).toBe("on_track");
    expect(plan.schedule?.behindBy).toBe(0);
    expect(toPlanView(plan).scheduleLabel).toBe("Ви йдете за графіком — рекомендовано 7 днів на модуль · ще 12 хв");
  });

  it("відставання: рекомендована дата минула, модуль не складено", () => {
    const plan = buildCoursePlan([mod({ id: 1 }), mod({ id: 2 })], [], { assignedAt: ASSIGNED, dueDate: null }, NOW, PACING);
    expect(plan.schedule?.status).toBe("behind");
    expect(plan.schedule?.behindBy).toBe(1);
    expect(plan.modules[0].behindTarget).toBe(true);
    expect(plan.modules[1].behindTarget).toBe(false);
    expect(toPlanView(plan).scheduleLabel).toBe("Відстаєте від графіка на 1 модуль — рекомендовано 7 днів на модуль · ще 12 хв");
  });

  it("випередження: складено більше, ніж вимагав графік", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3 })],
      [done({ moduleId: 1 }), done({ moduleId: 2 })],
      { assignedAt: ASSIGNED, dueDate: null },
      NOW,
      PACING
    );
    expect(plan.schedule?.status).toBe("ahead");
    expect(toPlanView(plan).scheduleLabel).toBe("Випереджаєте графік на 1 модуль — рекомендовано 7 днів на модуль · ще 6 хв");
  });

  it("без moduleDays графіка й цільових дат немає", () => {
    const plan = buildCoursePlan([mod({ id: 1 })], [], { assignedAt: ASSIGNED, dueDate: null }, NOW, { moduleDays: null, pauseDays: 3 });
    expect(plan.schedule).toBeNull();
    expect(plan.modules[0].targetDate).toBeNull();
    expect(toPlanView(plan).modules[0].targetLabel).toBeNull();
  });

  it("усе складено — підпис графіка не потрібен", () => {
    const plan = buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1 })], { assignedAt: ASSIGNED, dueDate: null }, NOW, PACING);
    expect(toPlanView(plan).scheduleLabel).toBeNull();
  });
});

describe("toPlanView — статус сертифіката (замінює банер над планом)", () => {
  it("курс без модулів — сертифіката немає", () => {
    const plan = buildCoursePlan([], [], NO_DATES, NOW);
    expect(toPlanView(plan).certificateLabel).toBeNull();
  });

  it("вимкнений у курсі сертифікат — факту немає, навіть якщо все на 100%", () => {
    const plan = buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1, scorePercent: 100 })], NO_DATES, NOW);
    expect(toPlanView(plan, false).certificateLabel).toBeNull();
  });

  it("нічого ще не пройдено — ціль «за складений курс»", () => {
    const plan = buildCoursePlan([mod({ id: 1 }), mod({ id: 2 })], [], NO_DATES, NOW);
    const view = toPlanView(plan);
    expect(view.certificateLabel).toBe("За складений курс");
    expect(view.certificateEarned).toBe(false);
  });

  it("складено лише частину модулів — ще не отримано", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1, scorePercent: 90 })],
      NO_DATES,
      NOW
    );
    const view = toPlanView(plan);
    expect(view.certificateLabel).toBe("За складений курс");
    expect(view.certificateEarned).toBe(false);
  });

  it("усе складено на 100% — отримано", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1, scorePercent: 100 }), done({ moduleId: 2, scorePercent: 100 })],
      NO_DATES,
      NOW
    );
    const view = toPlanView(plan);
    expect(view.certificateLabel).toBe("Отримано");
    expect(view.certificateEarned).toBe(true);
  });

  // Один критерій сертифіката на весь застосунок (2026-09-22, повернуто
  // після реверсу рішення 2026-09-19): КОЖЕН модуль рівно на 100%, а не
  // просто складений курс — складений, але не ідеальний результат
  // сертифіката не дає.
  it("усе складено, але не на 100% — ще не отримано", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1, scorePercent: 100 }), done({ moduleId: 2, scorePercent: 90 })],
      NO_DATES,
      NOW
    );
    const view = toPlanView(plan);
    expect(view.certificateLabel).toBe("За складений курс");
    expect(view.certificateEarned).toBe(false);
  });

  it("провалений модуль — курс ще не складено, сертифіката немає", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [done({ moduleId: 1, scorePercent: 100 }), done({ moduleId: 2, scorePercent: 40, passed: false })],
      NO_DATES,
      NOW
    );
    const view = toPlanView(plan);
    expect(view.certificateLabel).toBe("За складений курс");
    expect(view.certificateEarned).toBe(false);
  });
});

describe("toPlanView — «ще N хв» не дублюється", () => {
  it("pace-рядок, що вже називає час (daysLeft<=7), другого часу не отримує", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 })],
      [],
      { assignedAt: null, dueDate: new Date("2026-09-20T09:00:00Z") },
      NOW
    );
    const label = toPlanView(plan).paceLabel;
    expect(label).toContain("плануйте");
    expect(label?.match(/хв/g)?.length).toBe(1);
  });

  it("графік + прострочений дедлайн показуються поруч — час лише в pace-рядку", () => {
    const plan = buildCoursePlan(
      [mod({ id: 1 }), mod({ id: 2 })],
      [],
      { assignedAt: new Date("2026-08-01T09:00:00Z"), dueDate: new Date("2026-09-01T09:00:00Z") },
      NOW,
      { moduleDays: 7, pauseDays: 0 }
    );
    const view = toPlanView(plan);
    expect(view.overdue).toBe(true);
    expect(view.scheduleLabel).not.toContain("хв");
    expect(view.paceLabel).toContain("хв");
  });
});

describe("toPlanView — лаконічні причини блокування з іконкою (2026-09-17)", () => {
  it("просто «наступний за порядком», без жодної дати — сама коротка причина", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 }), mod({ id: 2 })], [], NO_DATES, NOW));
    expect(view.modules[1].lockLabel).toBe("Після попереднього модуля");
    expect(view.modules[1].lockKind).toBe("sequence");
  });

  it("точна дата відкриття лишає дієслово — коротко й так, не позначали", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1 }), mod({ id: 2, cooldownDays: 3 })],
        [done({ moduleId: 1, completedAt: new Date("2026-09-16T09:00:00Z") })],
        NO_DATES,
        NOW
      )
    );
    expect(view.modules[1].lockLabel).toBe("Відкриється 19.09.2026");
    expect(view.modules[1].lockKind).toBe("date");
  });

  it("складений модуль причини блокування не має (не заблокований)", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1 })], NO_DATES, NOW));
    expect(view.modules[0].lockKind).toBeNull();
  });
});

describe("toPlanView — реальний час замінює оцінку, медаль за бал модуля", () => {
  it("не пройдений модуль — орієнтовна оцінка зі знаком приблизності", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1, componentCount: 8 })], [], NO_DATES, NOW));
    expect(view.modules[0].timeLabel).toBe("≈ 6 хв");
  });

  it("пройдений модуль без збереженого durationSeconds — теж лише оцінка", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1 })], NO_DATES, NOW));
    expect(view.modules[0].timeLabel).toBe("≈ 6 хв");
  });

  it("пройдений модуль із реальним часом — факт без знака приблизності", () => {
    const view = toPlanView(
      buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1, durationSeconds: 500 })], NO_DATES, NOW)
    );
    expect(view.modules[0].timeLabel).toBe("8 хв");
  });

  it("медаль рахується від бала модуля, як і на картці курсу", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1 }), mod({ id: 2 }), mod({ id: 3 }), mod({ id: 4 })],
        [
          done({ moduleId: 1, scorePercent: 100 }),
          done({ moduleId: 2, scorePercent: 96 }),
          done({ moduleId: 3, scorePercent: 92 }),
          done({ moduleId: 4, scorePercent: 80 }),
        ],
        NO_DATES,
        NOW
      )
    );
    expect(view.modules[0].medalTier).toBe("gold");
    expect(view.modules[1].medalTier).toBe("silver");
    expect(view.modules[2].medalTier).toBe("bronze");
    expect(view.modules[3].medalTier).toBeNull();
  });
});

describe("pickPlanFocusModuleId — куди скролити/підсвітити при вході в план", () => {
  it("пріоритет 1: nextModuleId, коли є доступний або провалений модуль", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 }), mod({ id: 2 })], [], NO_DATES, NOW));
    expect(pickPlanFocusModuleId(view)).toBe(1);
  });

  it("пріоритет 2: перший заблокований модуль, коли nextModuleId немає", () => {
    const view = toPlanView(
      buildCoursePlan(
        [mod({ id: 1 }), mod({ id: 2, cooldownDays: 3 })],
        [done({ moduleId: 1, completedAt: new Date("2026-09-16T09:00:00Z") })],
        NO_DATES,
        NOW
      )
    );
    expect(view.nextModuleId).toBeNull();
    expect(pickPlanFocusModuleId(view)).toBe(2);
  });

  it("пріоритет 3: перший складений-не-на-100% модуль, коли немає ні наступного, ні заблокованого", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1, scorePercent: 85 })], NO_DATES, NOW));
    expect(view.nextModuleId).toBeNull();
    expect(pickPlanFocusModuleId(view)).toBe(1);
  });

  it("null, коли все складено рівно на 100% — покращувати/чекати нічого", () => {
    const view = toPlanView(buildCoursePlan([mod({ id: 1 })], [done({ moduleId: 1, scorePercent: 100 })], NO_DATES, NOW));
    expect(pickPlanFocusModuleId(view)).toBeNull();
  });
});

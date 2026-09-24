import { describe, expect, it } from "vitest";
import { toManagerUrl } from "./notificationTypes";
import type { RawCourse, RawEmployee, RawEnrollment, TeamRaw } from "./teamEnrollments";
import {
  applyTeamFilters,
  attentionTop,
  buildMatrix,
  buildPeople,
  buildTeamRows,
  courseFunnels,
  parseTeamQuery,
  pluralPeople,
  reasonLabel,
  retriedEnrollmentIds,
  statusBar,
  subtreeIds,
  teamQueryHref,
} from "./teamInsights";

const NOW = new Date("2026-09-23T09:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function employee(over: Partial<RawEmployee> & { id: number }): RawEmployee {
  return { name: `Особа ${over.id}`, externalCode: `TP${over.id}`, avatarUrl: null, managerId: 100, isActive: true, lastSeenAt: NOW, position: { code: "TP", name: "ТП", level: 4 }, ...over };
}

function course(over: Partial<RawCourse> & { id: number }): RawCourse {
  return {
    title: `Курс ${over.id}`,
    slug: `course-${over.id}`,
    isMandatory: true,
    moduleDays: null,
    modulePauseDays: null,
    retryFreeAttempts: null,
    retryCooldownHours: null,
    modules: [1, 2, 3].map((n) => ({ id: over.id * 10 + n, title: `M${n}`, order: n, cooldownDays: null, retakeCooldownDays: null, retryFreeAttempts: null, retryCooldownHours: null })),
    ...over,
  };
}

function enrollment(over: Partial<RawEnrollment> & { id: number; employeeId: number; courseId: number }): RawEnrollment {
  return { status: "not_started", assignedAt: day(-10), dueDate: day(10), completedAt: null, scorePercent: null, passed: null, ...over };
}

function raw(over: Partial<TeamRaw>): TeamRaw {
  return { employees: [], enrollments: [], courses: [], completions: [], attempts: [], ...over };
}

describe("сегмент людини — worst-wins", () => {
  it("прострочення перемагає все інше", () => {
    const data = raw({
      employees: [employee({ id: 1, lastSeenAt: null })],
      courses: [course({ id: 1 })],
      enrollments: [enrollment({ id: 1, employeeId: 1, courseId: 1, status: "in_progress", dueDate: day(-1) })],
    });
    const rows = buildTeamRows(data, NOW);
    const [p] = buildPeople(rows, data, NOW);
    expect(rows[0].isOverdue).toBe(true);
    expect(p.segment).toBe("overdue");
  });

  it("«відстає» — лише через графік модулів (moduleDays)", () => {
    const data = raw({
      employees: [employee({ id: 1 })],
      courses: [course({ id: 1, moduleDays: 2 })],
      enrollments: [enrollment({ id: 1, employeeId: 1, courseId: 1, status: "in_progress", assignedAt: day(-10), dueDate: day(30) })],
    });
    const rows = buildTeamRows(data, NOW);
    expect(rows[0].schedule).toBe("behind");
    expect(buildPeople(rows, data, NOW)[0].segment).toBe("behind");

    const noPacing = raw({ ...data, courses: [course({ id: 1 })] });
    const rows2 = buildTeamRows(noPacing, NOW);
    expect(rows2[0].schedule).toBeNull();
    expect(buildPeople(rows2, noPacing, NOW)[0].segment).toBe("on_track");
  });

  it("не почав — коли ВСІ призначення not_started; неактивний — 14 днів без входу", () => {
    const data = raw({
      employees: [employee({ id: 1 }), employee({ id: 2, lastSeenAt: day(-15) }), employee({ id: 3, lastSeenAt: day(-13) })],
      courses: [course({ id: 1 })],
      enrollments: [
        enrollment({ id: 1, employeeId: 1, courseId: 1 }),
        enrollment({ id: 2, employeeId: 2, courseId: 1, status: "in_progress" }),
        enrollment({ id: 3, employeeId: 3, courseId: 1, status: "in_progress" }),
      ],
    });
    const people = buildPeople(buildTeamRows(data, NOW), data, NOW);
    expect(people.map((p) => p.segment)).toEqual(["not_started", "inactive", "on_track"]);
  });

  it("без призначень — поза полосою, але рахується окремо", () => {
    const data = raw({ employees: [employee({ id: 1 }), employee({ id: 2 })], courses: [course({ id: 1 })], enrollments: [enrollment({ id: 1, employeeId: 1, courseId: 1, status: "completed", passed: true, scorePercent: 90, completedAt: day(-2) })] });
    const rows = buildTeamRows(data, NOW);
    const people = buildPeople(rows, data, NOW);
    const bar = statusBar(people, rows);
    expect(bar.noEnrollments).toBe(1);
    expect(bar.total).toBe(1);
    expect(bar.segments.find((s) => s.key === "on_track")?.count).toBe(1);
    expect(bar.segments.reduce((s, x) => s + x.count, 0)).toBe(bar.total);
  });

  it("полоса дає ДВА числа: людей у сегменті і курсів у цьому стані", () => {
    // Одна людина з двома простроченими курсами: 1 людина, 2 курси —
    // саме та розбіжність, через яку «Прострочено 7» читалось як курси.
    const data = raw({
      employees: [employee({ id: 1 }), employee({ id: 2 })],
      courses: [course({ id: 1 }), course({ id: 2 })],
      enrollments: [
        enrollment({ id: 1, employeeId: 1, courseId: 1, status: "overdue", dueDate: day(-3) }),
        enrollment({ id: 2, employeeId: 1, courseId: 2, status: "in_progress", dueDate: day(-1) }),
        enrollment({ id: 3, employeeId: 2, courseId: 1, status: "completed", passed: true, scorePercent: 90, completedAt: day(-1) }),
      ],
    });
    const rows = buildTeamRows(data, NOW);
    const bar = statusBar(buildPeople(rows, data, NOW), rows);
    const overdue = bar.segments.find((s) => s.key === "overdue")!;
    expect(overdue.count).toBe(1);
    expect(overdue.courses).toBe(2);
    // «Неактивні» — властивість людини, курсів там не буває.
    expect(bar.segments.find((s) => s.key === "inactive")?.courses).toBeNull();
  });

  it("посилання «для хаба» ведуть у відповідний розділ кабінету керівника", () => {
    expect(toManagerUrl("/hub/achievements?highlight=badge&badgeId=7")).toBe("/manager/achievements?highlight=badge&badgeId=7");
    expect(toManagerUrl("/hub/learn")).toBe("/manager/courses");
    expect(toManagerUrl("/hub")).toBe("/manager");
    // Невідомий /hub-шлях — на дашборд, але query зберігається.
    expect(toManagerUrl("/hub/whatever?x=1")).toBe("/manager?x=1");
    // Спільні для обох кабінетів шляхи не чіпаємо.
    expect(toManagerUrl("/courses/carls-znaiomstvo-z-platformoiu")).toBe("/courses/carls-znaiomstvo-z-platformoiu");
    expect(toManagerUrl("/hubbub")).toBe("/hubbub");
    expect(toManagerUrl(null)).toBeNull();
  });

  it("підпис причини завжди називає одиницю", () => {
    expect(reasonLabel("not_started", 1)).toBe("1 курс не розпочато");
    expect(reasonLabel("overdue", 2)).toBe("2 курси прострочено");
    expect(reasonLabel("overdue", 5)).toBe("5 курсів прострочено");
    expect(pluralPeople(1)).toBe("людина");
    expect(pluralPeople(3)).toBe("людини");
    expect(pluralPeople(7)).toBe("людей");
  });
});

describe("увага, матриця, воронки", () => {
  const data = raw({
    employees: [employee({ id: 1 }), employee({ id: 2 }), employee({ id: 3 })],
    courses: [course({ id: 1 }), course({ id: 2 })],
    enrollments: [
      enrollment({ id: 1, employeeId: 1, courseId: 1, status: "overdue", dueDate: day(-3) }),
      enrollment({ id: 2, employeeId: 1, courseId: 2 }),
      enrollment({ id: 3, employeeId: 2, courseId: 1, status: "completed", passed: true, scorePercent: 100, completedAt: day(-1) }),
      enrollment({ id: 4, employeeId: 3, courseId: 1, status: "completed", passed: false, scorePercent: 40, completedAt: day(-1) }),
    ],
  });
  const rows = buildTeamRows(data, NOW);
  const people = buildPeople(rows, data, NOW);

  it("топ уваги — найтерміновіші зверху, з причинами й курсом-прикладом", () => {
    const top = attentionTop(people, rows, 5);
    expect(top[0].person.id).toBe(1);
    expect(top[0].reasons.map((r) => r.kind)).toEqual(["overdue", "not_started"]);
    expect(top[0].reasons.map((r) => r.label)).toEqual(["1 курс прострочено", "1 курс не розпочато"]);
    expect(top[0].reasons[0].courseSlug).toBe("course-1");
    expect(top.some((t) => t.person.id === 2)).toBe(false);
  });

  it("матриця обрізає рядки й лишає статуси клітинок", () => {
    const m = buildMatrix(people, rows, 2);
    expect(m.courses.map((c) => c.id)).toEqual([1, 2]);
    expect(m.rows).toHaveLength(2);
    expect(m.hiddenPeople).toBe(1);
    expect(m.rows[0].person.id).toBe(1);
    expect(m.rows[0].cells.map((c) => c.status)).toEqual(["overdue", "not_started"]);
  });

  it("воронка курсу: призначено → почали → склали → 100%", () => {
    const [f] = courseFunnels(rows);
    expect(f).toMatchObject({ id: 1, assigned: 3, started: 3, passed: 1, perfect: 1 });
  });
});

describe("parseTeamQuery / applyTeamFilters", () => {
  it("порожній query — люди без фільтрів (відсутні числа — null, не 0)", () => {
    const q = parseTeamQuery({ status: "overdue" });
    expect(q.view).toBe("people");
    expect(q.status).toBe("overdue");
    expect(q.week).toBeNull();
    expect(q.module).toBeNull();
    expect(teamQueryHref(q)).toBe("/manager/team?status=overdue");
    expect(parseTeamQuery({ week: "0" }).week).toBe(0);
  });

  it("ігнорує сміття, форсує view=courses для due/score/module", () => {
    const q = parseTeamQuery({ status: "weird", due: "week", module: "abc", week: "99", team: "-1" });
    expect(q.view).toBe("courses");
    expect(q.status).toBeNull();
    expect(q.due).toBe("week");
    expect(q.module).toBeNull();
    expect(q.week).toBeNull();
    expect(q.team).toBeNull();
    expect(teamQueryHref(q)).toBe("/manager/team?view=courses&due=week");
  });

  it("людський статус фільтрує людей, курсовий — призначення; чужий team= ігнорується", () => {
    const data = raw({
      employees: [employee({ id: 1, managerId: 100 }), employee({ id: 2, managerId: 1 }), employee({ id: 3, managerId: 100 })],
      courses: [course({ id: 1 })],
      enrollments: [
        enrollment({ id: 1, employeeId: 1, courseId: 1, status: "overdue", dueDate: day(-3) }),
        enrollment({ id: 2, employeeId: 2, courseId: 1, status: "completed", passed: true, scorePercent: 85, completedAt: day(-1) }),
        enrollment({ id: 3, employeeId: 3, courseId: 1, status: "in_progress" }),
      ],
    });
    const rows = buildTeamRows(data, NOW);
    const people = buildPeople(rows, data, NOW);
    const ctx = { now: NOW, retried: new Set<number>() };

    expect(applyTeamFilters(rows, people, parseTeamQuery({ status: "overdue" }), ctx).people.map((p) => p.id)).toEqual([1]);
    expect(applyTeamFilters(rows, people, parseTeamQuery({ view: "courses", status: "passed" }), ctx).rows.map((r) => r.enrollmentId)).toEqual([2]);
    expect(applyTeamFilters(rows, people, parseTeamQuery({ view: "courses", due: "overdue" }), ctx).rows).toHaveLength(1);
    expect(subtreeIds(people, 1)).toEqual(new Set([1, 2]));
    expect(applyTeamFilters(rows, people, parseTeamQuery({ team: "1" }), ctx).people.map((p) => p.id).sort()).toEqual([1, 2]);
    expect(applyTeamFilters(rows, people, parseTeamQuery({ team: "999" }), ctx).people).toHaveLength(3);
  });

  it("retried — ті, чия перша спроба була невдалою", () => {
    const set = retriedEnrollmentIds([
      { enrollmentId: 1, completedAt: day(-2), passed: false },
      { enrollmentId: 1, completedAt: day(-1), passed: true },
      { enrollmentId: 2, completedAt: day(-1), passed: true },
    ]);
    expect(set).toEqual(new Set([1]));
  });
});

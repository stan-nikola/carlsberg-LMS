import { describe, it, expect } from "vitest";
import {
  computeCourseEvents,
  computeBadgeEvent,
  levelFor,
  breakdown,
  rankOf,
  mandatoryProgress,
  normalizeByCohort,
  computeTeamRating,
  DEFAULT_RULES,
  DEFAULT_LEVELS,
  type RatingEventInput,
} from "@/lib/ratingLogic";

const enr = (over = {}) => ({
  id: 7,
  employeeId: 42,
  passed: true,
  scorePercent: 90,
  completedAt: new Date("2026-09-10"),
  dueDate: new Date("2026-09-20"),
  ...over,
});
const kinds = (evs: RatingEventInput[]) => evs.map((e) => e.kind);

describe("computeCourseEvents", () => {
  it("складено вчасно з першої спроби на 90% — база + перша спроба + вчасно, без 100%", () => {
    const evs = computeCourseEvents({ enrollment: enr(), course: { points: null }, attemptNumber: 1, existingKinds: new Set(), rules: DEFAULT_RULES });
    expect(kinds(evs)).toEqual(["course_completed", "first_attempt", "on_time"]);
    expect(evs.map((e) => e.points)).toEqual([100, 25, 25]);
    expect(evs[0]).toMatchObject({ employeeId: 42, refType: "enrollment", refId: 7 });
  });

  it("не складено — жодних балів (за спробу не платимо)", () => {
    expect(computeCourseEvents({ enrollment: enr({ passed: false, scorePercent: 60 }), course: {}, attemptNumber: 1, existingKinds: new Set(), rules: DEFAULT_RULES })).toEqual([]);
  });

  it("Course.points перекриває правило; прострочений — без «вчасно», без дедлайну — теж", () => {
    const late = computeCourseEvents({ enrollment: enr({ completedAt: new Date("2026-09-25") }), course: { points: 300 }, attemptNumber: 2, existingKinds: new Set(), rules: DEFAULT_RULES });
    expect(kinds(late)).toEqual(["course_completed"]);
    expect(late[0].points).toBe(300);
    const noDue = computeCourseEvents({ enrollment: enr({ dueDate: null }), course: {}, attemptNumber: 2, existingKinds: new Set(), rules: DEFAULT_RULES });
    expect(kinds(noDue)).toEqual(["course_completed"]);
  });

  // Пересдача до 100%: база вже нарахована — доначислюється лише бонус.
  it("пересдача до 100% доначисляє тільки course_perfect", () => {
    const evs = computeCourseEvents({
      enrollment: enr({ scorePercent: 100 }),
      course: {},
      attemptNumber: 3,
      existingKinds: new Set(["course_completed", "on_time"]),
      rules: DEFAULT_RULES,
    });
    expect(kinds(evs)).toEqual(["course_perfect"]);
  });

  it("вимкнене правило або 0 балів — події нема", () => {
    const rules = DEFAULT_RULES.map((r) => (r.key === "first_attempt" ? { ...r, enabled: false } : r));
    const evs = computeCourseEvents({ enrollment: enr(), course: {}, attemptNumber: 1, existingKinds: new Set(), rules });
    expect(kinds(evs)).not.toContain("first_attempt");
  });
});

describe("computeBadgeEvent / levelFor / breakdown / rankOf", () => {
  it("відзнака з 0 балів — декоративна", () => {
    expect(computeBadgeEvent(1, { id: 5, points: 0 })).toBeNull();
    expect(computeBadgeEvent(1, { id: 5, points: 40 })).toMatchObject({ kind: "badge", points: 40, refId: 5 });
  });

  it("рівні за порогами і прогрес до наступного", () => {
    expect(levelFor(0, DEFAULT_LEVELS)).toMatchObject({ label: "Новачок", progress: 0 });
    expect(levelFor(550, DEFAULT_LEVELS)).toMatchObject({ label: "Стажер" });
    expect(levelFor(550, DEFAULT_LEVELS).progress).toBeCloseTo(0.5);
    expect(levelFor(9000, DEFAULT_LEVELS)).toMatchObject({ label: "Експерт", next: null, progress: 1 });
  });

  it("розбивка «за що» і місце в когорті", () => {
    const b = breakdown([
      { kind: "course_completed", points: 100 },
      { kind: "on_time", points: 25 },
      { kind: "badge", points: 50 },
    ]);
    expect(b).toEqual({ total: 175, courses: 100, bonuses: 25, badges: 50 });
    const rows = [{ employeeId: 3, points: 500 }, { employeeId: 42, points: 175 }, { employeeId: 9, points: 0 }];
    expect(rankOf(rows, 42)).toEqual({ rank: 2, size: 3 });
    expect(rankOf(rows, 99)).toEqual({ rank: null, size: 3 });
  });
});

describe("normalizeByCohort", () => {
  it("ТП з 80% від максимуму своєї посади вище за SV з 60% від свого, хоч балів у SV більше", () => {
    const rows = [
      { employeeId: 1, points: 900, positionId: 2 }, // SV, max 1500
      { employeeId: 2, points: 800, positionId: 5 }, // ТП, max 1000
      { employeeId: 3, points: 0, positionId: null },
    ];
    const out = normalizeByCohort(rows, new Map([[2, 1500], [5, 1000]]));
    expect(out.map((r) => [r.employeeId, r.normalized])).toEqual([[2, 80], [1, 60], [3, 0]]);
  });
});

describe("mandatoryProgress", () => {
  it("рахує лише обов'язкові: пройдено / прострочено / найближчий дедлайн", () => {
    const now = new Date("2026-09-15");
    const r = mandatoryProgress(
      [
        { isMandatory: true, status: "completed", dueDate: new Date("2026-09-01") },
        { isMandatory: true, status: "in_progress", dueDate: new Date("2026-09-10") },
        { isMandatory: true, status: "not_started", dueDate: new Date("2026-09-30") },
        { isMandatory: true, status: "not_started", dueDate: new Date("2026-09-20") },
        { isMandatory: false, status: "not_started", dueDate: new Date("2026-09-16") },
      ],
      now
    );
    expect(r).toEqual({ total: 4, completed: 1, overdue: 1, nextDue: new Date("2026-09-20") });
  });
});

describe("computeTeamRating", () => {
  it("середній % команди і місце серед керівників тієї ж посади", () => {
    // 10, 20 — ASM (посада 1); 11,12 — ТП під 10; 21 — ТП під 20; 30 — ТП без керівника
    const people = [
      { id: 10, managerId: null, positionId: 1 },
      { id: 20, managerId: null, positionId: 1 },
      { id: 11, managerId: 10, positionId: 5 },
      { id: 12, managerId: 10, positionId: 5 },
      { id: 21, managerId: 20, positionId: 5 },
      { id: 30, managerId: null, positionId: 5 },
    ];
    const points = new Map([[11, 500], [12, 250], [21, 1000], [30, 800]]);
    const r = computeTeamRating(people, points, { id: 10, positionId: 1 });
    expect(r.byEmployeeId).toEqual({ 11: { points: 500, normalized: 50 }, 12: { points: 250, normalized: 25 } });
    expect(r.avg).toBe(38);
    expect(r).toMatchObject({ rank: 2, teams: 2 });
    expect(computeTeamRating(people, points, { id: 20, positionId: 1 })).toMatchObject({ avg: 100, rank: 1 });
  });
});

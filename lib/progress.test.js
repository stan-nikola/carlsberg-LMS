import { describe, it, expect } from "vitest";
import { isRecentlyAssigned, isOverdue, pickContinueEnrollments, groupLearning, sortByUrgency, moduleProgress } from "@/lib/progress";

describe("isRecentlyAssigned", () => {
  const now = new Date("2026-09-10T12:00:00Z");

  it("true — призначено 1 день тому, ще не розпочато", () => {
    const enrollment = { status: "not_started", assignedAt: "2026-09-09T12:00:00Z" };
    expect(isRecentlyAssigned(enrollment, now)).toBe(true);
  });

  it("false — призначено 5 днів тому (за межами вікна 3 дні)", () => {
    const enrollment = { status: "not_started", assignedAt: "2026-09-05T12:00:00Z" };
    expect(isRecentlyAssigned(enrollment, now)).toBe(false);
  });

  it("false — недавно призначено, але вже in_progress (мітка \"Нове\" зникає одразу, як відкрили)", () => {
    const enrollment = { status: "in_progress", assignedAt: "2026-09-09T12:00:00Z" };
    expect(isRecentlyAssigned(enrollment, now)).toBe(false);
  });

  it("false — немає enrollment", () => {
    expect(isRecentlyAssigned(null, now)).toBe(false);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-09-10T12:00:00Z");

  it("true — dueDate у минулому, курс ще не завершений", () => {
    const enrollment = { status: "in_progress", dueDate: "2026-09-01T00:00:00Z" };
    expect(isOverdue(enrollment, now)).toBe(true);
  });

  it("false — dueDate у майбутньому", () => {
    const enrollment = { status: "not_started", dueDate: "2026-09-20T00:00:00Z" };
    expect(isOverdue(enrollment, now)).toBe(false);
  });

  it("false — dueDate у минулому, але курс уже завершений (наздоганяти нічого)", () => {
    const enrollment = { status: "completed", dueDate: "2026-09-01T00:00:00Z" };
    expect(isOverdue(enrollment, now)).toBe(false);
  });

  it("false — немає dueDate (курс без дедлайну)", () => {
    const enrollment = { status: "not_started", dueDate: null };
    expect(isOverdue(enrollment, now)).toBe(false);
  });
});

describe("pickContinueEnrollments", () => {
  it("виключає completed, лишає решту, за замовчуванням до 3", () => {
    const enrollments = [
      { id: 1, status: "not_started" },
      { id: 2, status: "completed" },
      { id: 3, status: "in_progress" },
      { id: 4, status: "not_started" },
      { id: 5, status: "overdue" },
    ];
    const result = pickContinueEnrollments(enrollments);
    expect(result.map((e) => e.id)).toEqual([5, 3, 1, 4].slice(0, 3));
  });

  it("пріоритет: overdue -> in_progress -> not_started, у межах статусу лишається початковий порядок", () => {
    const enrollments = [
      { id: 1, status: "not_started" },
      { id: 2, status: "overdue" },
      { id: 3, status: "in_progress" },
      { id: 4, status: "not_started" },
    ];
    const result = pickContinueEnrollments(enrollments, 4);
    expect(result.map((e) => e.id)).toEqual([2, 3, 1, 4]);
  });

  it("поважає limit", () => {
    const enrollments = [{ id: 1, status: "not_started" }, { id: 2, status: "not_started" }, { id: 3, status: "not_started" }];
    expect(pickContinueEnrollments(enrollments, 1)).toHaveLength(1);
  });

  it("усе completed або порожньо — повертає порожній масив (не enrollments[0], як раніше)", () => {
    expect(pickContinueEnrollments([{ id: 1, status: "completed" }])).toEqual([]);
    expect(pickContinueEnrollments([])).toEqual([]);
  });
});

describe("groupLearning", () => {
  it("прострочені → за датою публікації (старіші вище); незалік лишається активним; залік окремо", () => {
    const now = new Date("2026-09-15");
    const pub = (d) => ({ course: { publishAt: d } });
    const es = [
      { id: 1, isMandatory: true, status: "not_started", dueDate: "2026-09-30", ...pub("2026-09-10") },
      { id: 2, isMandatory: true, status: "in_progress", dueDate: "2026-09-01", ...pub("2026-09-12") }, // прострочено
      { id: 3, isMandatory: true, status: "not_started", dueDate: "2026-09-20", ...pub("2026-09-01") },
      { id: 8, isMandatory: true, status: "completed", passed: false, dueDate: null, ...pub("2026-08-01") }, // незалік
      { id: 4, isMandatory: false, status: "not_started", dueDate: null, assignedAt: "2026-09-05" },
      { id: 5, isMandatory: false, status: "in_progress", dueDate: null, ...pub("2026-09-03") },
      { id: 6, isMandatory: false, status: "not_started", dueDate: "2026-10-01", ...pub("2026-09-04") },
      { id: 7, isMandatory: true, status: "completed", passed: true, dueDate: "2026-09-01", ...pub("2026-07-01") },
    ];
    const g = groupLearning(es, now);
    expect(g.mandatory.map((e) => e.id)).toEqual([2, 8, 3, 1]);
    expect(g.optional.map((e) => e.id)).toEqual([5, 6, 4]);
    expect(g.completed.map((e) => e.id)).toEqual([7]);
  });
});

describe("sortByUrgency", () => {
  it("прострочені → не складені (старіші публікації вище) → складені", () => {
    const now = new Date("2026-09-15");
    const pub = (d) => ({ course: { publishAt: d } });
    const es = [
      { id: 1, status: "completed", passed: true, dueDate: null, ...pub("2026-08-01") },
      { id: 2, status: "not_started", dueDate: "2026-09-30", ...pub("2026-09-12") },
      { id: 3, status: "in_progress", dueDate: "2026-09-01", ...pub("2026-09-10") }, // прострочено
      { id: 4, status: "completed", passed: false, dueDate: null, ...pub("2026-09-05") }, // незалік = не складено
      { id: 5, status: "not_started", dueDate: null, ...pub("2026-09-02") },
    ];
    expect(sortByUrgency(es, now).map((e) => e.id)).toEqual([3, 5, 4, 2, 1]);
  });
});

describe("moduleProgress — прогрес по складених модулях", () => {
  const mod = (status) => ({ status });

  it("курс без модулів прогресу не має", () => {
    expect(moduleProgress([])).toEqual({ passed: 0, total: 0, pct: 0 });
    expect(moduleProgress(undefined)).toEqual({ passed: 0, total: 0, pct: 0 });
  });

  it("рахує лише складені, не провалені й не доступні", () => {
    const p = moduleProgress([mod("completed"), mod("failed"), mod("available"), mod("locked")]);
    expect(p).toEqual({ passed: 1, total: 4, pct: 25 });
  });

  it("один із десяти — 10%, а не нуль", () => {
    const modules = [mod("completed"), ...Array.from({ length: 9 }, () => mod("locked"))];
    expect(moduleProgress(modules)).toEqual({ passed: 1, total: 10, pct: 10 });
  });

  it("усі складені — 100%", () => {
    expect(moduleProgress([mod("completed"), mod("completed")]).pct).toBe(100);
  });
});

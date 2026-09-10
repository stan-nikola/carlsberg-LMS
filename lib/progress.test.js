import { describe, it, expect } from "vitest";
import { isRecentlyAssigned, isOverdue, pickContinueEnrollments } from "@/lib/progress";

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

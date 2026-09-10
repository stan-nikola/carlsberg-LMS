import { describe, it, expect } from "vitest";
import { isRecentlyAssigned, isOverdue } from "@/lib/progress";

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

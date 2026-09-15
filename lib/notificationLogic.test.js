import { describe, it, expect } from "vitest";
import { selectDeadlineReminders, deadlineReminderText, buildTeamDigest, dateKey } from "@/lib/notificationLogic";
import { wantsCategory, sanitizePreferences, categoryOf, formatRelativeTime } from "@/lib/notificationTypes";

const NOW = new Date("2026-09-15T06:00:00Z");
const days = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
const enr = (id, dueDate, status = "in_progress") => ({
  id,
  employeeId: 100 + id,
  dueDate,
  status,
  course: { title: `Курс ${id}`, slug: `c${id}` },
});

describe("selectDeadlineReminders", () => {
  it("за 2.5 дні — лише нагадування «3 дні»; за 0.5 дня — і «3», і «1»", () => {
    const out = selectDeadlineReminders([enr(1, days(2.5)), enr(2, days(0.5))], NOW);
    expect(out.map((r) => r.dedupeKey)).toEqual(["deadline:1:3d", "deadline:2:3d", "deadline:2:1d"]);
    // dedupeKey на кожне нагадування свій — cron може крутитись щодня,
    // Notification.dedupeKey @unique не дасть повтору.
  });

  it("далекий дедлайн, прострочений, завершений, без дедлайну — нічого", () => {
    const out = selectDeadlineReminders(
      [enr(1, days(5)), enr(2, days(-1)), enr(3, days(1), "completed"), enr(4, null)],
      NOW
    );
    expect(out).toEqual([]);
  });

  it("daysLeft округлюється вгору — «завтра», а не «0.6 дня»", () => {
    const [r] = selectDeadlineReminders([enr(1, days(0.6))], NOW).filter((x) => x.type === "deadline_1d");
    expect(r.daysLeft).toBe(1);
    expect(deadlineReminderText(r.daysLeft, "X")).toMatch(/Завтра/);
    expect(deadlineReminderText(3, "X")).toBe("До кінця терміну «X» — 3 дн.");
  });
});

describe("buildTeamDigest", () => {
  const ev = (name, title, status, score, completedAt = NOW) => ({
    employee: { name },
    course: { title },
    status,
    scorePercent: score,
    completedAt: status === "completed" ? completedAt : null,
  });

  it("порожня доба — null (нічого не шлемо)", () => {
    expect(buildTeamDigest([])).toBeNull();
  });

  it("рахує завершені, стобальні й прострочені; імен не більше трьох", () => {
    const d = buildTeamDigest([
      ev("А", "К1", "completed", 100),
      ev("Б", "К2", "completed", 80),
      ev("В", "К3", "completed", 100),
      ev("Г", "К4", "completed", 90),
      ev("Д", "К5", "overdue", null),
    ]);
    expect(d.title).toBe("Команда за добу: 4 завершено, 1 прострочено");
    expect(d.message).toContain("(на 100%: 2)");
    expect(d.message).toContain("А — «К1» (100%)");
    expect(d.message).not.toContain("Г — «К4»");
    expect(d.message).toContain("…");
    expect(d.message).toContain("Прострочено: 1. Д — «К5»");
  });

  it("dateKey — стабільний ключ дня для dedupe", () => {
    expect(dateKey(NOW)).toBe("2026-09-15");
  });
});

describe("notificationTypes", () => {
  it("категорія за типом; невідомий тип — system і не вимикається", () => {
    expect(categoryOf("deadline_1d")).toBe("deadlines");
    expect(categoryOf("weird")).toBe("system");
    expect(wantsCategory({ deadlines: false }, "system")).toBe(true);
  });

  it("без рядка вподобань — усе увімкнено; false вимикає лише свою категорію", () => {
    expect(wantsCategory(null, "badges")).toBe(true);
    expect(wantsCategory({ badges: false }, "badges")).toBe(false);
    expect(wantsCategory({ badges: false }, "courses")).toBe(true);
  });

  it("sanitizePreferences — лише відомі ключі, лише boolean", () => {
    expect(sanitizePreferences({ courses: false, news: "no", hacker: true })).toEqual({ courses: false });
  });

  it("formatRelativeTime", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 30 * 1000), NOW)).toBe("щойно");
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60 * 1000), NOW)).toBe("5 хв тому");
    expect(formatRelativeTime(new Date(NOW.getTime() - 3 * 3600 * 1000), NOW)).toBe("3 год тому");
    expect(formatRelativeTime(days(-1), NOW)).toBe("вчора");
    expect(formatRelativeTime(days(-3), NOW)).toBe("3 дн. тому");
    expect(formatRelativeTime(days(-30), NOW)).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});

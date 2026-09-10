import { describe, it, expect } from "vitest";
import { DEFAULT_STREAK_MESSAGES, courseStreakMessages, pickStreakMessage, resolveStreakSub } from "@/lib/streakMessages";

describe("pickStreakMessage", () => {
  it("спрацьовує рівно на threshold (2, 4) — одноразово", () => {
    expect(pickStreakMessage(2, DEFAULT_STREAK_MESSAGES)?.title).toBe("Чудовий старт!");
    expect(pickStreakMessage(4, DEFAULT_STREAK_MESSAGES)?.title).toBe("Ви тримаєте темп!");
  });

  it("між порогами (3, 5) — нічого не показує", () => {
    expect(pickStreakMessage(3, DEFAULT_STREAK_MESSAGES)).toBeNull();
    expect(pickStreakMessage(5, DEFAULT_STREAK_MESSAGES)).toBeNull();
  });

  it("repeatEvery — повторюється на 6, 9, 12... (та сама поведінка, що й у legacy streakCopy)", () => {
    expect(pickStreakMessage(6, DEFAULT_STREAK_MESSAGES)?.title).toBe("Вражаюча серія!");
    expect(pickStreakMessage(9, DEFAULT_STREAK_MESSAGES)?.title).toBe("Вражаюча серія!");
    expect(pickStreakMessage(12, DEFAULT_STREAK_MESSAGES)?.title).toBe("Вражаюча серія!");
  });

  it("repeatEvery — НЕ спрацьовує на 7 чи 8 (не кратно 3 від порогу 6)", () => {
    expect(pickStreakMessage(7, DEFAULT_STREAK_MESSAGES)).toBeNull();
    expect(pickStreakMessage(8, DEFAULT_STREAK_MESSAGES)).toBeNull();
  });

  it("одноразове повідомлення (repeatEvery: null) не повторюється на кратних числах", () => {
    const messages = [{ threshold: 2, repeatEvery: null, icon: "x", title: "T", sub: "" }];
    expect(pickStreakMessage(4, messages)).toBeNull();
  });
});

describe("courseStreakMessages", () => {
  it("бере DEFAULT_STREAK_MESSAGES, коли в курсу streakMessages не задано", () => {
    expect(courseStreakMessages({ streakMessages: null })).toBe(DEFAULT_STREAK_MESSAGES);
    expect(courseStreakMessages({ streakMessages: [] })).toBe(DEFAULT_STREAK_MESSAGES);
    expect(courseStreakMessages({})).toBe(DEFAULT_STREAK_MESSAGES);
  });

  it("бере власний список курсу, якщо він заданий", () => {
    const own = [{ threshold: 3, repeatEvery: null, icon: "y", title: "Custom", sub: "" }];
    expect(courseStreakMessages({ streakMessages: own })).toBe(own);
  });
});

describe("resolveStreakSub", () => {
  it("підставляє {n} поточним значенням streak", () => {
    expect(resolveStreakSub({ sub: "{n} поспіль!" }, 9)).toBe("9 поспіль!");
  });

  it("текст без {n} лишається як є", () => {
    expect(resolveStreakSub({ sub: "Чудово!" }, 2)).toBe("Чудово!");
  });
});

import { describe, it, expect } from "vitest";
import { STREAK_PRESET_MESSAGES, courseStreakMessages, pickStreakMessage, resolveStreakSub } from "@/lib/streakMessages";

describe("STREAK_PRESET_MESSAGES", () => {
  it("рівно 10 порогів, строго по наростанню", () => {
    expect(STREAK_PRESET_MESSAGES).toHaveLength(10);
    const thresholds = STREAK_PRESET_MESSAGES.map((m) => m.threshold);
    const sorted = [...thresholds].sort((a, b) => a - b);
    expect(thresholds).toEqual(sorted);
    expect(new Set(thresholds).size).toBe(10); // без дублів
  });
});

describe("courseStreakMessages", () => {
  it("вимкнено (null/не масив) — порожній список, тостів не буде", () => {
    expect(courseStreakMessages({ streakMessages: null })).toEqual([]);
    expect(courseStreakMessages({})).toEqual([]);
  });

  it("увімкнено — повертає збережений список як є", () => {
    expect(courseStreakMessages({ streakMessages: STREAK_PRESET_MESSAGES })).toBe(STREAK_PRESET_MESSAGES);
  });
});

describe("pickStreakMessage", () => {
  it("спрацьовує рівно на кожному з 10 порогів", () => {
    expect(pickStreakMessage(2, STREAK_PRESET_MESSAGES)?.title).toBe("Чудовий старт!");
    expect(pickStreakMessage(6, STREAK_PRESET_MESSAGES)?.title).toBe("Вражаюча серія!");
    expect(pickStreakMessage(12, STREAK_PRESET_MESSAGES)?.title).toBe("Легенда телесейлу!");
  });

  it("між порогами і після останнього (13+) — нічого не показує", () => {
    expect(pickStreakMessage(11, STREAK_PRESET_MESSAGES)).toBeNull();
    expect(pickStreakMessage(13, STREAK_PRESET_MESSAGES)).toBeNull();
  });

  it("порожній список (мотивація вимкнена) — ніколи нічого не показує", () => {
    expect(pickStreakMessage(2, [])).toBeNull();
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

import { describe, it, expect } from "vitest";
import {
  STREAK_PRESET_MESSAGES,
  courseStreakMessages,
  pickStreakMessage,
  resolveStreakSub,
  isScheduledStreak,
} from "@/lib/streakMessages";

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

describe("isScheduledStreak", () => {
  it("«круглі» віхи: 2, 5, 10, далі кожні 5", () => {
    [2, 5, 10, 15, 20, 25, 30].forEach((n) => expect(isScheduledStreak(n)).toBe(true));
  });

  it("усе інше — не віха (у т.ч. проміжні числа й довжини блоків типу 3/4/7)", () => {
    [0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16].forEach((n) => expect(isScheduledStreak(n)).toBe(false));
  });
});

describe("pickStreakMessage", () => {
  it("спрацьовує рівно на кожному з 10 прописаних порогів", () => {
    expect(pickStreakMessage(2, STREAK_PRESET_MESSAGES)?.title).toBe("Чудовий старт!");
    expect(pickStreakMessage(6, STREAK_PRESET_MESSAGES)?.title).toBe("Вражаюча серія!");
    expect(pickStreakMessage(12, STREAK_PRESET_MESSAGES)?.title).toBe("Легенда телесейлу!");
  });

  it("понад 10 без точного порогу (11, 13, 15, 30...) — перевикористовує повідомлення threshold:12", () => {
    [11, 13, 15, 20, 30].forEach((n) => {
      expect(pickStreakMessage(n, STREAK_PRESET_MESSAGES)?.title).toBe("Легенда телесейлу!");
    });
  });

  it("між 2 і 10 без точного порогу (тут таких немає, усі 2-10 прописані) — не застосовується до <=10", () => {
    // Усі значення 2..10 прописані явно (для довжин блоку, що на них влучають) — застосунок
    // fallback лише понад 10, а не "між" довільними прописаними порогами.
    expect(pickStreakMessage(1, STREAK_PRESET_MESSAGES)).toBeNull();
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

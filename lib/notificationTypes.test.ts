import { describe, it, expect } from "vitest";
import {
  telegramCategoryKey,
  TELEGRAM_CATEGORY_KEYS,
  wantsCategory,
  wantsTelegramCategory,
  sanitizePreferences,
} from "@/lib/notificationTypes";

describe("telegramCategoryKey", () => {
  it("капіталізує перший символ категорії", () => {
    expect(telegramCategoryKey("courses")).toBe("telegramCourses");
    expect(telegramCategoryKey("news")).toBe("telegramNews");
  });
  it("покриває всі 5 категорій", () => {
    expect(TELEGRAM_CATEGORY_KEYS).toEqual(["telegramCourses", "telegramDeadlines", "telegramBadges", "telegramTeam", "telegramNews"]);
  });
});

describe("wantsCategory / wantsTelegramCategory — незалежні списки", () => {
  it("без рядка в БД — усе увімкнено для обох каналів", () => {
    expect(wantsCategory(null, "courses")).toBe(true);
    expect(wantsTelegramCategory(null, "courses")).toBe(true);
  });
  it("вимкнене в Push не вимикає Telegram і навпаки", () => {
    const prefs = { courses: false, telegramCourses: true, deadlines: true, telegramDeadlines: false };
    expect(wantsCategory(prefs, "courses")).toBe(false);
    expect(wantsTelegramCategory(prefs, "courses")).toBe(true);
    expect(wantsCategory(prefs, "deadlines")).toBe(true);
    expect(wantsTelegramCategory(prefs, "deadlines")).toBe(false);
  });
  it("службові (system) ніколи не вимикаються", () => {
    expect(wantsCategory({ courses: false }, "system")).toBe(true);
    expect(wantsTelegramCategory({ telegramCourses: false }, "system")).toBe(true);
  });
});

describe("sanitizePreferences", () => {
  it("приймає і push-, і telegram-ключі, відкидає невідоме й нелогічне", () => {
    expect(sanitizePreferences({ courses: false, telegramCourses: true, telegram: false, bogus: true, badges: "yes" })).toEqual({
      courses: false,
      telegramCourses: true,
    });
  });
  it("порожній/невалідний вхід — порожній об'єкт", () => {
    expect(sanitizePreferences(null)).toEqual({});
    expect(sanitizePreferences("x")).toEqual({});
  });
});

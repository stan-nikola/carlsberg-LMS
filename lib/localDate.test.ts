import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, greetingForHour } from "./localDate";

describe("formatDate / formatDateTime — пояс показу", () => {
  const t = new Date("2026-09-30T21:30:00Z"); // 00:30 1 жовтня в Україні, 23:30 30.09 у Варшаві

  it("на сервері (без window) — український пояс", () => {
    expect(formatDate(t)).toBe("01.10.2026");
  });

  it("явний пояс пристрою дає його календарний день", () => {
    expect(formatDate(t, {}, "Europe/Warsaw")).toBe("30.09.2026");
    expect(formatDateTime(t, { hour: "2-digit", minute: "2-digit" }, "Europe/Warsaw")).toContain("23:30");
  });
});

describe("greetingForHour", () => {
  it("межі 12:00 і 18:00", () => {
    expect(greetingForHour(11)).toBe("Доброго ранку");
    expect(greetingForHour(12)).toBe("Доброго дня");
    expect(greetingForHour(18)).toBe("Доброго вечора");
  });
});

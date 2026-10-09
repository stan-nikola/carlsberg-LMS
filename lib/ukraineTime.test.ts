import { describe, expect, it } from "vitest";
import { deadlineAfterDays, endOfUkraineDay, endOfUkraineDayFromInput, formatUkraineDate, ukraineDayKey, ukraineHour } from "./ukraineTime";

describe("ukraineTime", () => {
  it("00:30 за українським часом — це вже наступний день, хоча в UTC ще попередній", () => {
    const t = new Date("2026-09-30T21:30:00Z"); // 00:30 1 жовтня за українським часом (UTC+3)
    expect(ukraineDayKey(t)).toBe("2026-10-01");
    expect(formatUkraineDate(t)).toBe("01.10.2026");
  });

  it("кінець дня враховує літній і зимовий час", () => {
    expect(endOfUkraineDay(new Date("2026-07-15T10:00:00Z")).toISOString()).toBe("2026-07-15T20:59:59.999Z"); // UTC+3
    expect(endOfUkraineDay(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-12-15T21:59:59.999Z"); // UTC+2
  });

  it("дата з форми — до кінця цього дня за українським часом, а не 03:00", () => {
    expect(endOfUkraineDayFromInput("2026-10-01")!.toISOString()).toBe("2026-10-01T20:59:59.999Z");
    expect(endOfUkraineDayFromInput("не дата")).toBeNull();
  });

  it("дедлайн через N днів — кінець українського дня", () => {
    const assigned = new Date("2026-09-27T21:30:00Z"); // 00:30 28.09 за українським часом
    expect(deadlineAfterDays(assigned, 7).toISOString()).toBe("2026-10-05T20:59:59.999Z");
  });
});

describe("ukraineHour — щоденний cron о 9:00 за українським часом", () => {
  it("влітку 9:00 за українським часом — це 06:00 UTC, взимку — 07:00 UTC", () => {
    expect(ukraineHour(new Date("2026-10-04T06:00:00Z"))).toBe(9);
    expect(ukraineHour(new Date("2026-10-04T07:00:00Z"))).toBe(10);
    expect(ukraineHour(new Date("2026-11-04T06:00:00Z"))).toBe(8);
    expect(ukraineHour(new Date("2026-11-04T07:00:00Z"))).toBe(9);
  });
});

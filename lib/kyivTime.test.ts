import { describe, expect, it } from "vitest";
import { deadlineAfterDays, endOfKyivDay, endOfKyivDayFromInput, formatKyivDate, kyivDayKey, kyivHour } from "./kyivTime";

describe("kyivTime", () => {
  it("00:30 за Києвом — це вже наступний день, хоча в UTC ще попередній", () => {
    const t = new Date("2026-09-30T21:30:00Z"); // 00:30 1 жовтня за Києвом (UTC+3)
    expect(kyivDayKey(t)).toBe("2026-10-01");
    expect(formatKyivDate(t)).toBe("01.10.2026");
  });

  it("кінець дня враховує літній і зимовий час", () => {
    expect(endOfKyivDay(new Date("2026-07-15T10:00:00Z")).toISOString()).toBe("2026-07-15T20:59:59.999Z"); // UTC+3
    expect(endOfKyivDay(new Date("2026-12-15T10:00:00Z")).toISOString()).toBe("2026-12-15T21:59:59.999Z"); // UTC+2
  });

  it("дата з форми — до кінця цього дня за Києвом, а не 03:00", () => {
    expect(endOfKyivDayFromInput("2026-10-01")!.toISOString()).toBe("2026-10-01T20:59:59.999Z");
    expect(endOfKyivDayFromInput("не дата")).toBeNull();
  });

  it("дедлайн через N днів — кінець київського дня", () => {
    const assigned = new Date("2026-09-27T21:30:00Z"); // 00:30 28.09 за Києвом
    expect(deadlineAfterDays(assigned, 7).toISOString()).toBe("2026-10-05T20:59:59.999Z");
  });
});

describe("kyivHour — щоденний cron о 9:00 за Києвом", () => {
  it("влітку 9:00 за Києвом — це 06:00 UTC, взимку — 07:00 UTC", () => {
    expect(kyivHour(new Date("2026-10-04T06:00:00Z"))).toBe(9);
    expect(kyivHour(new Date("2026-10-04T07:00:00Z"))).toBe(10);
    expect(kyivHour(new Date("2026-11-04T06:00:00Z"))).toBe(8);
    expect(kyivHour(new Date("2026-11-04T07:00:00Z"))).toBe(9);
  });
});

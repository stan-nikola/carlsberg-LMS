import { describe, expect, it } from "vitest";
import { actionLabelFor, dayGroupOf, groupByDay, shortTime } from "./notificationView";
import { personHref, personKeyOf } from "./personPath";

const now = new Date("2026-10-10T12:00:00+03:00");
const zone = "Europe/Kyiv";

describe("стрічка сповіщень керівника — групи за днями", () => {
  it("день рахується за календарем пояса, не за 24 годинами", () => {
    expect(dayGroupOf("2026-10-10T00:30:00+03:00", now, zone)).toBe("today");
    expect(dayGroupOf("2026-10-09T23:30:00+03:00", now, zone)).toBe("yesterday");
    expect(dayGroupOf("2026-10-05T12:00:00+03:00", now, zone)).toBe("week");
    expect(dayGroupOf("2026-10-01T12:00:00+03:00", now, zone)).toBe("earlier");
  });
  it("групи йдуть за порядком днів, порожні пропускаються", () => {
    const items = [{ id: 1, createdAt: "2026-10-10T09:00:00+03:00" }, { id: 2, createdAt: "2026-09-01T09:00:00+03:00" }];
    expect(groupByDay(items, now, zone).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Сьогодні", [1]],
      ["Раніше", [2]],
    ]);
  });
  it("час — лише сьогодні, інакше дата без року", () => {
    expect(shortTime("2026-10-10T09:05:00+03:00", now, zone)).toBe("09:05");
    expect(shortTime("2026-10-03T09:05:00+03:00", now, zone)).toBe("03.10");
  });
});

describe("стрічка сповіщень керівника — дія за адресою", () => {
  it("адреса людини — за кодом, без коду — за id", () => {
    expect(personHref({ id: 42, externalCode: "SR0016" })).toBe("/manager/team/SR0016");
    expect(personHref({ id: 42, externalCode: "SR0016" }, "pyvo")).toBe("/manager/team/SR0016?course=pyvo");
    expect(personHref({ id: 42, externalCode: null })).toBe("/manager/team/42");
  });
  it("ключ людини лише з адреси її сторінки", () => {
    expect(personKeyOf("/manager/team/SR0016")).toBe("SR0016");
    expect(personKeyOf("/manager/team/42?course=pyvo")).toBe("42");
    expect(personKeyOf("/manager/team?status=overdue")).toBeNull();
    expect(personKeyOf("/courses/pyvo")).toBeNull();
    expect(personKeyOf(null)).toBeNull();
  });
  it("підпис кнопки", () => {
    expect(actionLabelFor("/courses/pyvo")).toBe("Відкрити курс");
    expect(actionLabelFor("/manager/team/SR0016")).toBe("До людини");
    expect(actionLabelFor("/manager/achievements?highlight=badge&badgeId=3")).toBe("Відзнаки");
    expect(actionLabelFor("/manager")).toBe("Дашборд");
    expect(actionLabelFor("/manager/notifications?highlight=5")).toBe("Відкрити");
    expect(actionLabelFor(null)).toBeNull();
  });
});

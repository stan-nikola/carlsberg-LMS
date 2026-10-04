import { describe, it, expect } from "vitest";
import { COL, ROW, clamp, parseStore, tableKey } from "@/lib/tableSizes";

describe("tableSizes — розміри таблиць «як у Excel»", () => {
  it("ключ: id у шляху не важливий, заголовки й номер таблиці — важливі", () => {
    const a = tableKey("/admin/employees/42", 0, ["Курс", "Статус"]);
    expect(a).toBe(tableKey("/admin/employees/7/", 0, [" Курс ", "Статус"]));
    expect(a).not.toBe(tableKey("/admin/employees/7", 1, ["Курс", "Статус"]));
    expect(a).not.toBe(tableKey("/admin/employees/7", 0, ["Курс", "Бал"]));
    expect(tableKey("/manager/team", 0, ["Людина"])).toBe("/manager/team#0:Людина");
  });
  it("межі і сміття в сховищі", () => {
    expect(clamp(5, COL)).toBe(COL.min);
    expect(clamp(9999, ROW)).toBe(ROW.max);
    expect(parseStore("not json")).toEqual({});
    expect(parseStore(JSON.stringify({ t: { cols: { 0: 120, 1: "x" }, rows: { 3: 10 } }, empty: { cols: {} } }))).toEqual({ t: { cols: { 0: 120 }, rows: { 3: ROW.min } } });
  });
});

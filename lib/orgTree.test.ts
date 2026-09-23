import { describe, expect, it } from "vitest";
import { computeTreeVisibility, type OrgNode } from "./orgTree";

const node = (id: number, name: string, children: OrgNode[] = [], isActive = true): OrgNode => ({ id, name, isActive, children });

// ASM → Карманов → троє підлеглих; окремою гілкою — інший SV.
const tree: OrgNode[] = [
  node(1, "ASM Сумська область", [
    node(2, "Stanislav Karmanov1", [node(3, "Торговий представник"), node(4, "Мерчендайзер ТТ"), node(5, "Технік HoReCa", [], false)]),
    node(6, "Інший SV", [node(7, "Його підлеглий")]),
  ]),
];

describe("видимість дерева оргструктури", () => {
  it("без пошуку й з показом заморожених фільтра немає взагалі", () => {
    const { visibleIds } = computeTreeVisibility(tree);
    expect(visibleIds).toBeNull();
  });

  it("знайдений керівник показує ВСІХ своїх підлеглих", () => {
    const { visibleIds, forceExpandIds } = computeTreeVisibility(tree, { query: "karmanov" });
    // сам Карманов + троє підлеглих + ланцюжок предків (ASM)
    expect([...visibleIds!].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // ASM розгортаємо, щоб збіг у глибині було видно
    expect(forceExpandIds.has(1)).toBe(true);
    // Чужа гілка не показується
    expect(visibleIds!.has(6)).toBe(false);
    expect(visibleIds!.has(7)).toBe(false);
  });

  it("збіг у глибині лишає ланцюжок предків і розгортає його", () => {
    const { visibleIds, forceExpandIds } = computeTreeVisibility(tree, { query: "Його підлеглий" });
    expect([...visibleIds!].sort((a, b) => a - b)).toEqual([1, 6, 7]);
    expect(forceExpandIds.has(6)).toBe(true);
    expect(forceExpandIds.has(1)).toBe(true);
  });

  it("фільтр заморожених ховає їх і в піддереві знайденого керівника", () => {
    const { visibleIds } = computeTreeVisibility(tree, { query: "karmanov", showInactive: false });
    expect(visibleIds!.has(5)).toBe(false); // Технік HoReCa заморожений
    expect(visibleIds!.has(3)).toBe(true);
  });

  it("сам заморожений лишається видимим, поки під ним є активні", () => {
    const withFrozenManager: OrgNode[] = [node(10, "Заморожений SV", [node(11, "Активний ТП")], false)];
    const { visibleIds, forceExpandIds } = computeTreeVisibility(withFrozenManager, { showInactive: false });
    expect(visibleIds!.has(10)).toBe(true);
    expect(visibleIds!.has(11)).toBe(true);
    expect(forceExpandIds.has(10)).toBe(true);
  });

  it("нічого не знайдено — порожньо", () => {
    const { visibleIds } = computeTreeVisibility(tree, { query: "нікого такого немає" });
    expect(visibleIds!.size).toBe(0);
  });
});

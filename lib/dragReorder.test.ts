import { describe, expect, it } from "vitest";
import { moveAdjacent, reorderBefore } from "./dragReorder";

describe("reorderBefore", () => {
  it("тягнемо вниз — id стає ПІСЛЯ цілі", () => {
    expect(reorderBefore([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
  });

  it("тягнемо вгору — id стає ПЕРЕД ціллю", () => {
    expect(reorderBefore([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it("сусідній обмін — теж працює (найчастіший випадок під час драгу)", () => {
    expect(reorderBefore([1, 2, 3], 1, 2)).toEqual([2, 1, 3]);
  });

  it("та сама ціль — список не змінюється (той самий референс)", () => {
    const list = [1, 2, 3];
    expect(reorderBefore(list, 2, 2)).toBe(list);
  });

  it("невідомий id — список не змінюється", () => {
    const list = [1, 2, 3];
    expect(reorderBefore(list, 9, 2)).toBe(list);
    expect(reorderBefore(list, 2, 9)).toBe(list);
  });
});

describe("moveAdjacent", () => {
  it("рухає на крок вгору/вниз", () => {
    expect(moveAdjacent([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveAdjacent([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  });

  it("за межею списку — нічого не робить", () => {
    const list = [1, 2, 3];
    expect(moveAdjacent(list, 1, -1)).toBe(list);
    expect(moveAdjacent(list, 3, 1)).toBe(list);
  });
});

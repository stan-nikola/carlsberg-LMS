import { describe, expect, it } from "vitest";
import { CARD_S_PX, hasHoles, holeFillSteps, snapWidth, standardRows } from "./dashboardHeights";

describe("standardRows", () => {
  const gap = 16;
  const cell = 2;
  it("вміст до S — S, більше — L рівно у дві S разом із проміжком", () => {
    const s = standardRows(190, gap, cell);
    expect(standardRows(CARD_S_PX, gap, cell)).toBe(s);
    expect(standardRows(CARD_S_PX + 1, gap, cell)).toBe(2 * s);
    // Дві S одна над одною (кожна з проміжком) = одна L.
    expect(s * cell * 2).toBe(2 * s * cell);
    expect(s * cell - gap).toBe(CARD_S_PX);
  });
});

describe("hasHoles", () => {
  it("бачить порожню ¼ поруч зі звуженою карткою, щільна розкладка — без дір", () => {
    const tight = [
      { x: 0, y: 0, w: 6, h: 2 },
      { x: 6, y: 0, w: 6, h: 1 },
      { x: 6, y: 1, w: 6, h: 1 },
      { x: 0, y: 2, w: 12, h: 1 },
    ];
    expect(hasHoles(tight, 12)).toBe(false);
    // «Стан команди» звузили до ¼ — праворуч від неї діра, а нижче ще картки.
    const gap = [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 6, y: 0, w: 6, h: 1 },
      { x: 0, y: 1, w: 12, h: 1 },
    ];
    expect(hasHoles(gap, 12)).toBe(true);
  });
});

describe("holeFillSteps", () => {
  const S = 10;
  it("неповний ряд із ¼ — остання ¼ ширшає до ½", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, w: 3, h: S },
      { id: "b", x: 3, y: 0, w: 3, h: S },
      { id: "c", x: 6, y: 0, w: 3, h: S },
      { id: "d", x: 0, y: S, w: 12, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([{ id: "c", w: 6 }]);
  });
  it("S поруч з L і під нею порожньо, а нижче ще картки — S стає L", () => {
    const nodes = [
      { id: "big", x: 0, y: 0, w: 6, h: 2 * S },
      { id: "small", x: 6, y: 0, w: 6, h: S },
      { id: "next", x: 0, y: 2 * S, w: 12, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([{ id: "small", h: 2 * S }]);
  });
  it("останній ряд: L і S поруч — S стає L, без порожнього кута внизу", () => {
    const nodes = [
      { id: "top", x: 0, y: 0, w: 12, h: S },
      { id: "big", x: 0, y: S, w: 6, h: 2 * S },
      { id: "small", x: 6, y: S, w: 6, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([{ id: "small", h: 2 * S }]);
  });
  it("¼ + ½ + порожня ¼ — ¼ ширшає до ½, ½ зсувається праворуч", () => {
    const nodes = [
      { id: "q", x: 0, y: 0, w: 3, h: 2 * S },
      { id: "h", x: 3, y: 0, w: 6, h: 2 * S },
      { id: "next", x: 0, y: 2 * S, w: 12, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([
      { id: "h", x: 6, w: 6 },
      { id: "q", x: 0, w: 6 },
    ]);
  });
  it("¼ L поруч із двома S одна над одною (смуга на 9 колонок) — ¼ ширшає, колонка S зсувається", () => {
    const nodes = [
      { id: "q", x: 0, y: 0, w: 3, h: 2 * S },
      { id: "s1", x: 3, y: 0, w: 6, h: S },
      { id: "s2", x: 3, y: S, w: 6, h: S },
      { id: "next", x: 0, y: 2 * S, w: 12, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([
      { id: "s2", x: 6, w: 6 },
      { id: "s1", x: 6, w: 6 },
      { id: "q", x: 0, w: 6 },
    ]);
  });
  it("порожня ½ під L, нижче лише картки на всю ширину — перша, що може бути ½, переїжджає в діру", () => {
    const nodes = [
      { id: "big", x: 0, y: 0, w: 6, h: 2 * S },
      { id: "s", x: 6, y: 0, w: 6, h: S },
      { id: "tall", x: 6, y: S, w: 6, h: 2 * S },
      { id: "wide", x: 0, y: 3 * S, w: 12, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S, (id) => (id === "wide" ? 3 : 6))).toEqual([{ id: "wide", x: 0, y: 2 * S, w: 6 }]);
  });
  it("кінець дашборда: L | S над L — S їде вниз на всю ширину", () => {
    const nodes = [
      { id: "l1", x: 0, y: 0, w: 6, h: 2 * S },
      { id: "s", x: 6, y: 0, w: 6, h: S },
      { id: "l2", x: 6, y: S, w: 6, h: 2 * S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([{ id: "s", x: 0, y: 3 * S, w: 12 }]);
  });
  it("одинока ½ в останньому ряду — на всю ширину, без порожньої половини", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, w: 6, h: S },
      { id: "b", x: 6, y: 0, w: 6, h: S },
      { id: "c", x: 0, y: S, w: 6, h: S },
    ];
    expect(holeFillSteps(nodes, 12, S)).toEqual([{ id: "c", w: 12 }]);
  });
});

describe("snapWidth", () => {
  it("лише ¼ · ½ · уся ширина, з урахуванням мінімуму картки", () => {
    expect(snapWidth(2, 3)).toBe(3);
    expect(snapWidth(4, 3)).toBe(3);
    expect(snapWidth(5, 3)).toBe(6);
    expect(snapWidth(8, 3)).toBe(6);
    expect(snapWidth(10, 3)).toBe(12);
    expect(snapWidth(3, 6)).toBe(6);
    expect(snapWidth(6, 12)).toBe(12);
  });
});

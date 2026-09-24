import { describe, expect, it } from "vitest";
import { EMPTY_SIZES, MATRIX_SIZE, parseSizes, resizedTo, sizeOf, withSize } from "./matrixSizes";

describe("matrixSizes", () => {
  it("тягнути можна лише в межах min..max", () => {
    expect(resizedTo("col", 96, 40)).toBe(136);
    expect(resizedTo("col", 96, -500)).toBe(MATRIX_SIZE.col.min);
    expect(resizedTo("row", 32, 900)).toBe(MATRIX_SIZE.row.max);
    expect(resizedTo("name", 150, 10.4)).toBe(160);
  });

  it("withSize задає, скидає (null) і не чіпає сусідів", () => {
    let s = withSize(EMPTY_SIZES, "col", "a", 120);
    s = withSize(s, "row", "7", 40);
    s = withSize(s, "name", "", 200);
    expect(sizeOf(s, "col", "a")).toBe(120);
    expect(sizeOf(s, "col", "b")).toBe(MATRIX_SIZE.col.def);
    expect(sizeOf(s, "row", "7")).toBe(40);
    expect(sizeOf(s, "name")).toBe(200);

    s = withSize(s, "col", "a", null);
    s = withSize(s, "name", "", null);
    expect(sizeOf(s, "col", "a")).toBe(MATRIX_SIZE.col.def);
    expect(sizeOf(s, "name")).toBe(MATRIX_SIZE.name.def);
    expect(sizeOf(s, "row", "7")).toBe(40);
    // Вихідний об'єкт не мутується — це стан React.
    expect(EMPTY_SIZES).toEqual({ cols: {}, rows: {} });
  });

  it("parseSizes переживає сміття у сховищі по полю, а не цілком", () => {
    expect(parseSizes(null)).toEqual(EMPTY_SIZES);
    expect(parseSizes("not json")).toEqual(EMPTY_SIZES);
    expect(parseSizes("[1,2]")).toEqual(EMPTY_SIZES);
    const parsed = parseSizes(JSON.stringify({ name: "wide", cols: { a: 130, b: "x", c: 9999 }, rows: null }));
    expect(parsed).toEqual({ cols: { a: 130, c: MATRIX_SIZE.col.max }, rows: {} });
    expect(parseSizes(JSON.stringify({ name: 210, cols: {}, rows: { 5: 50 } }))).toEqual({ name: 210, cols: {}, rows: { 5: 50 } });
  });
});

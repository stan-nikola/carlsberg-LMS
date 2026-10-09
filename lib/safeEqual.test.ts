import { describe, expect, it } from "vitest";
import { safeEqual } from "./safeEqual";

describe("safeEqual", () => {
  it("однакові рядки — true, різні або різної довжини — false", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("незаданий секрет не збігається ні з чим, навіть з порожнім", () => {
    expect(safeEqual(undefined, "")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual(null, null)).toBe(false);
  });
});

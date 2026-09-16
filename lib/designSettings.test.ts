import { describe, it, expect, vi } from "vitest";

// designSettings імпортує prisma на верхньому рівні — мокаємо, як у permissions.test.js.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { sanitizeDesignValues, designCss } = await import("@/lib/designSettings");

describe("sanitizeDesignValues — whitelist для <style> у layout", () => {
  it("пропускає лише відомі ключі з валідними значеннями, дефолти відкидає", () => {
    expect(
      sanitizeDesignValues({
        "radius-btn": "12px",
        "radius-card": "0px", // дефолт — не зберігається
        "border-w": "1.5px",
        "card-shadow": "var(--shadow-resting)",
        "radius-badge": "var(--radius-btn)",
      })
    ).toEqual({ "radius-btn": "12px", "border-w": "1.5px", "card-shadow": "var(--shadow-resting)", "radius-badge": "var(--radius-btn)" });
  });
  it("відкидає чужі ключі, ін’єкції та значення поза варіантами; px обрізає в діапазон", () => {
    expect(
      sanitizeDesignValues({
        "radius-btn": "12px;} body{display:none}",
        "border-w": "3px",
        color: "red",
        "card-shadow": "url(x)",
        "btn-h-lg": "999px",
      })
    ).toEqual({ "btn-h-lg": "60px" });
    expect(sanitizeDesignValues(null)).toEqual({});
    expect(sanitizeDesignValues("x")).toEqual({});
  });
  it("designCss", () => {
    expect(designCss({ "radius-btn": "12px", "border-w": "2px" })).toBe(":root{--radius-btn:12px;--border-w:2px}");
    expect(designCss({})).toBe("");
    expect(designCss(null)).toBe("");
  });
});

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
  it("кольори елементів: вибір проходить whitelist і читається назад; дефолт коду не зберігається", async () => {
    const { accentTokenValues, readAccent, defaultValues } = await import("@/lib/designTokens");
    expect(readAccent("avatar", defaultValues())).toEqual({ color: "green-deep", style: "fill" });
    expect(readAccent("ring", defaultValues())).toEqual({ color: "brand-green", style: null });
    expect(sanitizeDesignValues(accentTokenValues("avatar", "green-deep", "fill"))).toEqual({});
    // Темний колір у заливці — білий текст; усі чотири токени проходять whitelist.
    const blue = accentTokenValues("avatar", "blue-main", "fill");
    expect(blue["accent-avatar-fg"]).toBe("var(--cb-white)");
    expect(sanitizeDesignValues(blue)).toEqual(Object.fromEntries(Object.entries(blue).filter(([k, v]) => defaultValues()[k] !== v)));
    expect(readAccent("avatar", { ...defaultValues(), ...blue })).toEqual({ color: "blue-main", style: "fill" });
    const teal = accentTokenValues("settings", "teal-main", "outline");
    expect(readAccent("settings", { ...defaultValues(), ...sanitizeDesignValues(teal) })).toEqual({ color: "teal-main", style: "outline" });
    expect(sanitizeDesignValues({ "accent-avatar": "var(--cb-brand-blue);}body{display:none" })).toEqual({});
  });
  it("сприйняття: «рекомендовано» проходить whitelist, «як зараз» = дефолт і не зберігається", async () => {
    const { PERCEPTION_FIXES, perceptionValues, readPerception, defaultValues } = await import("@/lib/designTokens");
    for (const fix of PERCEPTION_FIXES) {
      const rec = perceptionValues(fix.id, true);
      expect(sanitizeDesignValues(rec), fix.id).toEqual(rec);
      expect(sanitizeDesignValues(perceptionValues(fix.id, false)), fix.id).toEqual({});
      expect(readPerception(fix.id, defaultValues()), fix.id).toBe(false);
      expect(readPerception(fix.id, { ...defaultValues(), ...rec }), fix.id).toBe(true);
    }
  });
  it("designCss", () => {
    expect(designCss({ "radius-btn": "12px", "border-w": "2px" })).toBe(":root{--radius-btn:12px;--border-w:2px}");
    expect(designCss({})).toBe("");
    expect(designCss(null)).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ACCENT_COLORS, ACCENT_ELEMENTS, accentTokenDefs, accentTokenValues, allAccentValues, contrast, readAccent, surfaceHex } from "@/lib/accentPalette";

describe("accentPalette — кольори великих елементів", () => {
  it("дефолти в tokens.css = вибір у ACCENT_ELEMENTS.pick (дублюються, міняти в парі)", () => {
    const css = readFileSync("app/styles/tokens.css", "utf8");
    for (const e of ACCENT_ELEMENTS) {
      for (const [k, v] of Object.entries(accentTokenValues(e.id, e.pick.color, e.pick.style))) {
        expect(css, `--${k}`).toContain(`--${k}: ${v};`);
      }
    }
  });
  it("будь-який колір × вигляд читається назад тим самим вибором", () => {
    for (const e of ACCENT_ELEMENTS) {
      const styles = e.styles.length ? e.styles : [null];
      for (const c of ACCENT_COLORS) for (const s of styles) expect(readAccent(e.id, accentTokenValues(e.id, c.id, s)), `${e.id}/${c.id}/${s}`).toEqual({ color: c.id, style: s });
    }
  });
  it("поверхня для підказки «губиться на зеленій картці»: Carlsberg green на ній не видно, світлий тон — видно", () => {
    expect(contrast(surfaceHex("ring", "brand-green", null), "#00321e")).toBeLessThan(1.1);
    expect(contrast(surfaceHex("level", "teal-light", "tint"), "#00321e")).toBeGreaterThan(3);
  });
  it("«Усі однаково» не чіпає іконки налаштувань і зберігає вигляд кожного елемента", () => {
    const def = Object.assign({}, ...ACCENT_ELEMENTS.map((e) => accentTokenValues(e.id, e.pick.color, e.pick.style)));
    const all = allAccentValues("blue-main", def);
    expect(Object.keys(all).some((k) => k.startsWith("accent-settings"))).toBe(false);
    expect(readAccent("avatar", all)).toEqual({ color: "blue-main", style: "fill" });
    expect(readAccent("cert", all)).toEqual({ color: "blue-main", style: "outline" });
  });
  it("whitelist: дефолт кожного токена — серед його варіантів", () => {
    for (const d of accentTokenDefs("g")) expect(d.choices.map((c) => c.value), d.key).toContain(d.def);
  });
});

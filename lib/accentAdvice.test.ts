import { describe, it, expect } from "vitest";
import { ACCENT_GUIDE, ACCENT_PRESETS, ACCENT_SCREENS, MAX_PER_SCREEN, accentAdvice, accentVerdict, type AccentPick } from "@/lib/accentAdvice";
import { ACCENT_ELEMENTS, colorById } from "@/lib/accentPalette";

/** Пресет — лише кольори; вигляд — дефолтний із ACCENT_ELEMENTS. */
const withStyles = (colors: Record<string, string>): AccentPick =>
  Object.fromEntries(Object.entries(colors).map(([id, color]) => [id, { color, style: ACCENT_ELEMENTS.find((e) => e.id === id)!.pick.style }]));

describe("accentAdvice — підказки до кольорів елементів", () => {
  it("кожна готова гама проходить без підказок і не більше двох вторинних на екрані", () => {
    for (const p of ACCENT_PRESETS) {
      expect(accentAdvice(withStyles(p.colors)), p.key).toEqual({});
      for (const s of ACCENT_SCREENS) {
        const fams = new Set(s.elements.map((id) => colorById(p.colors[id])?.fam).filter((f) => f && f !== "brand" && f !== "grey"));
        expect(fams.size, `${p.key} / ${s.name}`).toBeLessThanOrEqual(MAX_PER_SCREEN);
      }
    }
  });
  it("статус поруч, зелене на зеленій картці, третій акцент — підказки", () => {
    expect(accentAdvice({ avatar: { color: "burgundy-main", style: "fill" } }).avatar?.[0]).toMatch(/Прострочено/);
    expect(accentAdvice({ ring: { color: "brand-green", style: null } }).ring?.[0]).toMatch(/Губиться/);
    // «Тон» світлить поверхню — та сама глибока бірюза на зірці вже видна.
    expect(accentAdvice({ level: { color: "blue-deep", style: "fill" } }).level).toBeDefined();
    expect(accentAdvice({ level: { color: "blue-deep", style: "tint" } }).level).toBeUndefined();
    const crowd = accentAdvice({ level: { color: "gold-main", style: "fill" }, badge: { color: "salmon-main", style: "tint" }, cert: { color: "blue-main", style: "outline" } });
    expect(crowd.badge?.[0]).toMatch(/Понад два/);
    // Відтінки одного кольору й Carlsberg green — не окремі акценти.
    expect(accentAdvice({ level: { color: "gold-light", style: "tint" }, badge: { color: "gold-deep", style: "tint" }, cert: { color: "brand-green", style: "outline" } })).toEqual({});
  });
  it("два статуси одного кольору — підказка обом; «Як зараз» не рахується", () => {
    const a = accentAdvice({ "st-fail": { color: "salmon-main", style: "tint" }, "st-alert": { color: "salmon-deep", style: "tint" }, "st-success": { color: "now", style: null } });
    expect(a["st-fail"]?.[0]).toMatch(/Увага/);
    expect(a["st-alert"]?.[0]).toMatch(/Тривога/);
    expect(a["st-success"]).toBeUndefined();
  });
  it("вердикт: пасує / можна / підказка", () => {
    expect(accentVerdict("badge", { color: "gold-main", style: "gradient" }, {}).level).toBe("best");
    expect(accentVerdict("badge", { color: "blue-main", style: "gradient" }, {}).level).toBe("ok");
    expect(accentVerdict("avatar", { color: "green-deep", style: "fill" }, {}).level).toBe("bad");
    for (const [id, g] of Object.entries(ACCENT_GUIDE)) expect(g.best.length, id).toBeGreaterThan(0);
    // Екран уже переповнений без аватара — плитка аватара за це не карається.
    const full = { level: { color: "teal-light", style: "tint" as const }, badge: { color: "green-light", style: "tint" as const }, cert: { color: "gold-light", style: "outline" as const } };
    expect(accentVerdict("avatar", { color: "blue-main", style: "fill" }, full).level).not.toBe("bad");
  });
});

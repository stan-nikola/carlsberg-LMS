import { describe, expect, it } from "vitest";
import { barsSvg, columnsSvg, donutSvg, ringsSvg, stackedBarSvg, CHART_COLORS } from "./reportCharts";

const rects = (svg: string) => svg.match(/<rect /g)?.length ?? 0;

describe("reportCharts", () => {
  it("смуги пропорційні максимуму, нуль — лише доріжка", () => {
    const svg = barsSvg([{ value: 10 }, { value: 5 }, { value: 0 }]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(rects(svg)).toBe(3 + 2); // 3 доріжки + 2 заповнені
    const widths = [...svg.matchAll(/width="(\d+)" height="14" rx="7" fill="#17B169"/g)].map((m) => Number(m[1]));
    expect(widths[0]).toBe(352);
    expect(widths[1]).toBe(176);
    expect(svg).not.toContain("NaN");
    // Жодного тексту: у serverless нема шрифтів для растеризації.
    expect(svg).not.toContain("<text");
  });

  it("колонки: висота за максимумом, нульова колонка без заливки", () => {
    const svg = columnsSvg([0, 4, 8]);
    expect(rects(svg)).toBe(3 + 2 + 1); // доріжки + 2 колонки + вісь
    expect(svg).not.toContain("NaN");
  });

  it("кільця: 100% — повне коло, 0% — лише доріжка, > 100 обрізається", () => {
    const full = ringsSvg([{ pct: 100, color: CHART_COLORS.green }]);
    const empty = ringsSvg([{ pct: 0, color: CHART_COLORS.green }]);
    const over = donutSvg(250);
    expect((full.match(/<circle /g) || []).length).toBe(2);
    expect((empty.match(/<circle /g) || []).length).toBe(1);
    const dash = over.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/);
    expect(dash).not.toBeNull();
    expect(Number(dash![1])).toBeCloseTo(Number(dash![2]), 1);
  });

  it("складена смуга: ширини сегментів у сумі дають ширину, пусті пропускаються", () => {
    const svg = stackedBarSvg([{ count: 1, color: "#a" }, { count: 0, color: "#b" }, { count: 3, color: "#c" }], 400);
    const ws = [...svg.matchAll(/<rect x="[\d.]+" y="4" width="([\d.]+)" height="20" fill="#(\w)"/g)].map((m) => [Number(m[1]), m[2]]);
    expect(ws.map((w) => w[1])).toEqual(["a", "c"]);
    expect(ws.reduce((s, w) => s + (w[0] as number), 0)).toBeCloseTo(400, 0);
    expect(stackedBarSvg([], 400)).toContain(CHART_COLORS.track);
  });
});

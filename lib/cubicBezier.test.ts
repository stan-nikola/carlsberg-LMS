import { describe, expect, it } from "vitest";
import { cubicBezierTimeAtProgress } from "./cubicBezier";

// --ease-premium (app/styles/tokens.css) — той самий, що й лінія плану курсу.
const EASE_PREMIUM = [0.2, 0.8, 0.2, 1] as const;

describe("cubicBezierTimeAtProgress", () => {
  it("межі: 0 і 1 повертаються без обчислень", () => {
    expect(cubicBezierTimeAtProgress(...EASE_PREMIUM, 0)).toBe(0);
    expect(cubicBezierTimeAtProgress(...EASE_PREMIUM, 1)).toBe(1);
  });

  it("ease-out крива (--ease-premium): половина прогресу настає РАНІШЕ половини часу", () => {
    const t = cubicBezierTimeAtProgress(...EASE_PREMIUM, 0.5);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.5);
  });

  it("монотонність — більший прогрес відповідає більшому (або рівному) часу", () => {
    const t1 = cubicBezierTimeAtProgress(...EASE_PREMIUM, 0.3);
    const t2 = cubicBezierTimeAtProgress(...EASE_PREMIUM, 0.7);
    expect(t2).toBeGreaterThan(t1);
  });

  it("лінійна крива (0,0,1,1) — час і прогрес збігаються", () => {
    expect(cubicBezierTimeAtProgress(0, 0, 1, 1, 0.5)).toBeCloseTo(0.5, 2);
    expect(cubicBezierTimeAtProgress(0, 0, 1, 1, 0.25)).toBeCloseTo(0.25, 2);
  });
});

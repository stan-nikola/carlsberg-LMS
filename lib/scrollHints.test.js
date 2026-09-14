import { describe, it, expect } from "vitest";
import { peekShift } from "@/lib/scrollHints";

const VIEWPORT = 800;

describe("peekShift", () => {
  // Головна причина існування цієї функції. Реальна скарга: відкриваєш
  // картку акордеона — і її власний текст одразу ж їде під верхній край,
  // прочитати неможливо. scrollIntoView({block:"start"}) саме це й робив.
  it("підводить ціль лише до нижньої частини екрана, а не під верхній край", () => {
    const shift = peekShift({ top: 1000 }, VIEWPORT);

    // Ціль опиняється на 72% висоти (576px), а не на 0 — попередній вміст
    // лишається на екрані.
    expect(shift).toBe(1000 - VIEWPORT * 0.72);
    expect(shift).toBeLessThan(1000);
  });

  it("ціль уже видно — екран не смикаємо", () => {
    // Верх цілі вище бажаної лінії: людина просто читає, тягнути її
    // кудись не треба.
    expect(peekShift({ top: 100 }, VIEWPORT)).toBe(0);
    expect(peekShift({ top: 0 }, VIEWPORT)).toBe(0);
  });

  it("ціль трохи нижче лінії — теж не смикаємо", () => {
    // 10px нижче бажаної позиції: прокрутка заради цього виглядала б як
    // випадковий зсув, а не як підказка.
    const justBelow = VIEWPORT * 0.72 + 10;
    expect(peekShift({ top: justBelow }, VIEWPORT)).toBe(0);
  });

  it("ціль помітно нижче — прокручуємо", () => {
    const wellBelow = VIEWPORT * 0.72 + 200;
    expect(peekShift({ top: wellBelow }, VIEWPORT)).toBe(200);
  });

  it("частку видимості можна задати", () => {
    // peekRatio 1 = ціль стає рівно біля нижнього краю.
    expect(peekShift({ top: 1000 }, VIEWPORT, 1)).toBe(1000 - VIEWPORT);
  });
});

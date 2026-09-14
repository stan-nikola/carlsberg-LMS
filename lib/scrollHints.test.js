import { describe, it, expect, afterEach, vi } from "vitest";
import { peekShift, peekScrollTo, scrollToEnd } from "@/lib/scrollHints";

const VIEWPORT = 800;

/**
 * Мінімальний DOM-стаб (environment у vitest — node, jsdom не підключено):
 * ціль усередині контейнера з overflow-y:auto, як .cp-viewport у плеєрі.
 * Перевіряємо саме те, що ламалось: скролитись має КОНТЕЙНЕР, не window.
 */
function makeScrollBox({ overflowY, targetTop, containerTop = 0, clientHeight = 400, scrollHeight = 1200 }) {
  const body = { parentElement: null };
  const container = {
    parentElement: body,
    clientHeight,
    scrollHeight,
    scrollBy: vi.fn(),
    getBoundingClientRect: () => ({ top: containerTop }),
    __overflowY: overflowY,
  };
  const target = {
    parentElement: container,
    getBoundingClientRect: () => ({ top: targetTop }),
  };
  globalThis.document = { body };
  globalThis.getComputedStyle = (el) => ({ overflowY: el.__overflowY ?? "visible" });
  globalThis.window = { innerHeight: VIEWPORT, scrollBy: vi.fn() };
  return { container, target };
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.getComputedStyle;
  delete globalThis.window;
});

describe("peekScrollTo — контейнер, а не вікно", () => {
  it("скролить найближчий overflow:auto-предок (.cp-viewport), window не чіпає", () => {
    // Ціль на 900px від верху вікна, контейнер починається на 100px і
    // має висоту 400 → всередині контейнера ціль на 800, бажана лінія
    // 0.72*400=288, зсув 512.
    const { container, target } = makeScrollBox({ overflowY: "auto", targetTop: 900, containerTop: 100 });
    expect(peekScrollTo(target)).toBe(512);
    expect(container.scrollBy).toHaveBeenCalledWith({ top: 512, behavior: "smooth" });
    expect(globalThis.window.scrollBy).not.toHaveBeenCalled();
  });

  it("предок без прокрутки не рахується — скролимо вікно", () => {
    const { container, target } = makeScrollBox({ overflowY: "visible", targetTop: 900 });
    expect(peekScrollTo(target)).toBe(900 - VIEWPORT * 0.72);
    expect(container.scrollBy).not.toHaveBeenCalled();
    expect(globalThis.window.scrollBy).toHaveBeenCalledTimes(1);
  });

  it("overflow:auto, але вміст влазить (нема чого крутити) — теж вікно", () => {
    const { container, target } = makeScrollBox({ overflowY: "auto", targetTop: 900, scrollHeight: 400 });
    peekScrollTo(target);
    expect(container.scrollBy).not.toHaveBeenCalled();
    expect(globalThis.window.scrollBy).toHaveBeenCalledTimes(1);
  });

  it("ціль уже видно всередині контейнера — нічого не крутимо", () => {
    const { container, target } = makeScrollBox({ overflowY: "auto", targetTop: 250, containerTop: 100 });
    expect(peekScrollTo(target)).toBeNull();
    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it("keepVisible без цілі — контейнер знаходимо через нього", () => {
    // Остання картка акордеона: наступної немає, але її власний низ
    // (контейнер 0..400, картка 300..600) треба показати: 600-(400-12)=212.
    const { container } = makeScrollBox({ overflowY: "auto", targetTop: 0 });
    const opened = { parentElement: container, getBoundingClientRect: () => ({ top: 300, bottom: 600 }) };
    expect(peekScrollTo(null, { keepVisible: opened })).toBe(212);
    expect(container.scrollBy).toHaveBeenCalledWith({ top: 212, behavior: "smooth" });
  });
});

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

describe("scrollToEnd — остання картка акордеона", () => {
  it("крутить контейнер до самого низу", () => {
    const { container, target } = makeScrollBox({ overflowY: "auto", targetTop: 0, clientHeight: 400, scrollHeight: 1200 });
    container.scrollTop = 100;
    container.scrollTo = vi.fn();
    expect(scrollToEnd(target)).toBe(true);
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
  });

  it("уже внизу (або майже) — не смикає", () => {
    const { container, target } = makeScrollBox({ overflowY: "auto", targetTop: 0, clientHeight: 400, scrollHeight: 1200 });
    container.scrollTop = 790;
    container.scrollTo = vi.fn();
    expect(scrollToEnd(target)).toBe(false);
    expect(container.scrollTo).not.toHaveBeenCalled();
  });
});

describe("peekShift — keepRect (щойно відкрита картка має вміститись)", () => {
  // Десктопний акордеон у два стовпці: «наступна» картка в тому ж ряду,
  // тобто її верх = верху відкритої. Peek-лінія (576) вже задоволена, але
  // низ відкритого тексту (900) виходить за в'юпорт (800).
  it("низ відкритого за краєм — докручуємо, хоч ціль і на місці", () => {
    const shift = peekShift({ top: 500 }, VIEWPORT, undefined, { top: 500, bottom: 900 });
    // 900 - (800 - 12) = 112
    expect(shift).toBe(112);
  });

  it("низ відкритого вміщається — keepRect нічого не додає", () => {
    expect(peekShift({ top: 500 }, VIEWPORT, undefined, { top: 500, bottom: 700 })).toBe(0);
  });

  it("верх відкритого не ховаємо за верхній край, навіть якщо низ не влазить", () => {
    // Картка вища за в'юпорт: 100..1500. Щоб показати низ, треба 712, але
    // тоді верх (100) піде за край — обмежуємось 100.
    expect(peekShift({ top: 100 }, VIEWPORT, undefined, { top: 100, bottom: 1500 })).toBe(100);
  });

  it("без цілі (остання картка) рахуємо лише по keepRect", () => {
    expect(peekShift(null, VIEWPORT, undefined, { top: 600, bottom: 1000 })).toBe(1000 - (VIEWPORT - 12));
    expect(peekShift(null, VIEWPORT, undefined, { top: 600, bottom: 700 })).toBe(0);
  });
});

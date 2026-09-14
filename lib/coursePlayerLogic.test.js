import { describe, it, expect } from "vitest";
import { numberComponents, shuffleArray } from "@/lib/coursePlayerLogic";

describe("numberComponents", () => {
  // Реальний баг: номер у кикері дорівнював номеру ЕКРАНА, і два питання
  // на одному екрані обидва показували «1».
  it("нумерує наскрізно по компонентах, а не по екранах", () => {
    const screens = [
      { components: [{ id: 10 }] },
      { components: [{ id: 20 }, { id: 21 }, { id: 22 }] },
      { components: [{ id: 30 }] },
    ];

    const numbers = numberComponents(screens);

    expect(numbers.get(10)).toBe(1);
    // Три компоненти одного екрана — 2, 3, 4, а не три однакові двійки.
    expect([numbers.get(20), numbers.get(21), numbers.get(22)]).toEqual([2, 3, 4]);
    expect(numbers.get(30)).toBe(5);
  });

  it("порожній курс не ламає нумерацію", () => {
    expect(numberComponents([]).size).toBe(0);
    expect(numberComponents([{ components: [] }]).size).toBe(0);
    expect(numberComponents(undefined).size).toBe(0);
  });
});

describe("shuffleArray", () => {
  // Головне, заради чого функція винесена: вона НЕ мутує вихідний масив.
  // Він приходить прямо з component.content, і перемішування на місці
  // зіпсувало б збережений контент курсу при першому ж показі.
  it("не чіпає вихідний масив", () => {
    const original = [{ text: "а" }, { text: "б" }, { text: "в" }];
    const copy = [...original];

    shuffleArray(original);

    expect(original).toEqual(copy);
  });

  it("зберігає всі елементи, нічого не губить і не дублює", () => {
    const original = Array.from({ length: 8 }, (_, i) => i);
    const shuffled = shuffleArray(original);

    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
  });

  it("порожнє й відсутнє значення дають порожній масив", () => {
    expect(shuffleArray([])).toEqual([]);
    expect(shuffleArray(undefined)).toEqual([]);
  });

  // Не «перевірка рандому», а захист від тривіальної помилки-заглушки:
  // реалізація, що повертає масив без змін, тут провалиться.
  it("реально переставляє елементи хоча б інколи", () => {
    const original = Array.from({ length: 12 }, (_, i) => i);
    const changedAtLeastOnce = Array.from({ length: 20 }, () =>
      shuffleArray(original).some((v, i) => v !== original[i])
    ).some(Boolean);

    expect(changedAtLeastOnce).toBe(true);
  });
});

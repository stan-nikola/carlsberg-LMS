import { describe, it, expect } from "vitest";
import {
  COMPONENT_TYPES,
  RETIRED_COMPONENT_TYPES,
  COMPONENT_TYPE_LABELS,
  defaultContentForType,
  gateTotal,
  gateHint,
  isGateSatisfied,
  isHotspotHit,
  isScored,
} from "@/lib/componentTypes";

describe("типи компонентів", () => {
  // Фото можна додати до БУДЬ-ЯКОГО компонента, не лише до інфо-блоку та
  // "фото" — тому кожен новий компонент мусить одразу мати куди їх класти.
  it("кожен доступний тип має images у стартовому content", () => {
    for (const t of COMPONENT_TYPES) {
      expect(defaultContentForType(t.value), t.value).toHaveProperty("images");
      expect(Array.isArray(defaultContentForType(t.value).images), t.value).toBe(true);
    }
  });
});

describe("isHotspotHit", () => {
  const zones = [{ x: 50, y: 50, r: 10 }];
  // Широке фото: висота вдвічі менша за ширину.
  const wide = 0.5;

  it("клік у центрі зони — влучання", () => {
    expect(isHotspotHit({ x: 50, y: 50 }, zones, wide)).toBe(true);
  });

  it("клік далеко від зони — промах", () => {
    expect(isHotspotHit({ x: 90, y: 50 }, zones, wide)).toBe(false);
  });

  // Головне, заради чого тут узагалі є aspectRatio. Відсотки по вертикалі
  // «коротші» за відсотки по горизонталі рівно у співвідношення сторін
  // разів. Без домноження dy кругла зона перетворилась би на еліпс: на
  // широкому фото зараховувало б удвічі більшу область по вертикалі, ніж
  // автор обвів.
  it("вертикаль міряється з поправкою на співвідношення сторін", () => {
    const point = { x: 50, y: 65 }; // 15% вниз від центру
    // На широкому фото 15% висоти = 7.5% ширини → у межах радіуса 10.
    expect(isHotspotHit(point, zones, 0.5)).toBe(true);
    // На вузькому (висота вдвічі більша за ширину) ті самі 15% висоти =
    // 30% ширини → уже поза зоною.
    expect(isHotspotHit(point, zones, 2)).toBe(false);
  });

  it("влучання в БУДЬ-ЯКУ зону зараховується", () => {
    const two = [
      { x: 10, y: 10, r: 5 },
      { x: 80, y: 80, r: 5 },
    ];
    expect(isHotspotHit({ x: 80, y: 80 }, two, 1)).toBe(true);
  });

  it("без зон питання не має правильної відповіді", () => {
    expect(isHotspotHit({ x: 50, y: 50 }, [], 1)).toBe(false);
    expect(isHotspotHit({ x: 50, y: 50 }, undefined, 1)).toBe(false);
  });

  // Реальний випадок, спійманий при перевірці: фото ще не завантажилось,
  // кадр нульової ширини, координати виходять NaN. Без явної перевірки
  // порівняння з NaN дає false — і людині тихо записується НЕПРАВИЛЬНА
  // відповідь за те, що вона натиснула раніше, ніж підвантажилась
  // картинка.
  it("невідомі координати або розмір кадру не зараховуються як промах", () => {
    const zones = [{ x: 50, y: 50, r: 25 }];
    expect(isHotspotHit({ x: NaN, y: 50 }, zones, 1)).toBe(false);
    expect(isHotspotHit({ x: 50, y: Infinity }, zones, 1)).toBe(false);
    expect(isHotspotHit({ x: 50, y: 50 }, zones, NaN)).toBe(false);
    expect(isHotspotHit(undefined, zones, 1)).toBe(false);
  });

  it("радіус за замовчуванням застосовується, якщо його не задано", () => {
    expect(isHotspotHit({ x: 54, y: 50 }, [{ x: 50, y: 50 }], 1)).toBe(true);
    expect(isHotspotHit({ x: 70, y: 50 }, [{ x: 50, y: 50 }], 1)).toBe(false);
  });
});

describe("оцінювані типи", () => {
  it("у бал ідуть саме питання й гаряча точка, а не гейти", () => {
    expect(isScored({ type: "quiz" })).toBe(true);
    expect(isScored({ type: "hotspot" })).toBe(true);
    // Гейти — це факт взаємодії, а не правильна відповідь.
    ["info", "accordion", "checklist", "script", "timeline", "photo", "input"].forEach((type) => {
      expect(isScored({ type }), type).toBe(false);
    });
  });
});

describe("застарілі типи", () => {
  it("«поле вводу» більше не можна обрати в конструкторі", () => {
    expect(COMPONENT_TYPES.map((t) => t.value)).not.toContain("input");
    expect(RETIRED_COMPONENT_TYPES.map((t) => t.value)).toContain("input");
  });

  // Головна пастка відключення типу: у базі лишились реальні компоненти
  // (на момент зміни — 30 у живих курсах). Без назви вони показувались би
  // в навігації конструктора сирим "input", а без гейта екран перестав би
  // вимагати від співробітника дії — тобто контент тихо змінив би
  // поведінку.
  it("наявні input-компоненти не втрачають ні назви, ні гейта", () => {
    expect(COMPONENT_TYPE_LABELS.input).toBe("поле вводу");

    const component = { type: "input", content: { label: "Напиши відповідь" } };
    expect(gateTotal(component)).toBe(1);
    expect(gateHint(component)).toBe("Введіть щось, щоб продовжити");
  });
});

describe("нові пояснювальні типи (2026-09-23)", () => {
  // Обидва — пояснялки, а не питання: якби вони потрапили в бал, курс із
  // такими екранами не можна було б скласти на 100%, бо «правильної»
  // відповіді там немає взагалі.
  it("фото з точками і «до/після» НЕ йдуть у бал", () => {
    expect(isScored({ type: "imagepins" })).toBe(false);
    expect(isScored({ type: "beforeafter" })).toBe(false);
  });

  it("гейт фото з точками — відкрити кожну", () => {
    const component = { type: "imagepins", content: { pins: [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 90, y: 90 }] } };
    expect(gateTotal(component)).toBe(3);
    expect(isGateSatisfied(component, 2)).toBe(false);
    expect(isGateSatisfied(component, 3)).toBe(true);
  });

  // Екран без точок не повинен замикати курс назавжди: гейт 0 = «Далі»
  // активна одразу (та сама логіка, що в info/photo).
  it("фото без точок не блокує «Далі»", () => {
    expect(isGateSatisfied({ type: "imagepins", content: { pins: [] } }, 0)).toBe(true);
  });

  it("«до/після» вимагає рівно одного перемикання", () => {
    const component = { type: "beforeafter", content: { images: [{ url: "a" }, { url: "b" }] } };
    expect(gateTotal(component)).toBe(1);
    expect(isGateSatisfied(component, 0)).toBe(false);
    expect(isGateSatisfied(component, 1)).toBe(true);
  });

  it("у кожного є підказка гейта і стартовий content", () => {
    for (const type of ["imagepins", "beforeafter"]) {
      expect(gateHint({ type }), type).not.toBe("");
      expect(defaultContentForType(type), type).toHaveProperty("images");
    }
  });
});

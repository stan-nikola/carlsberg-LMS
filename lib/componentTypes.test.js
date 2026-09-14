import { describe, it, expect } from "vitest";
import {
  COMPONENT_TYPES,
  RETIRED_COMPONENT_TYPES,
  COMPONENT_TYPE_LABELS,
  defaultContentForType,
  gateTotal,
  gateHint,
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

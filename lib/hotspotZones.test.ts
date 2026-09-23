import { describe, expect, it } from "vitest";
import { boxFromDrag, clampBox, moveBox, resizeBox, tapBox, toBox, zoneContains, zoneStyle } from "./hotspotZones";

describe("створення зони протяжкою", () => {
  it("напрямок протяжки не важить — рамка та сама", () => {
    const forward = boxFromDrag({ x: 10, y: 20 }, { x: 50, y: 60 }, "rect");
    const backward = boxFromDrag({ x: 50, y: 60 }, { x: 10, y: 20 }, "rect");
    expect(forward).toEqual(backward);
    expect(forward).toMatchObject({ x: 30, y: 40, w: 40, h: 40 });
  });

  it("протяжка за край кадру обрізається, а не виносить зону назовні", () => {
    const box = boxFromDrag({ x: 80, y: 80 }, { x: 200, y: 200 }, "rect");
    expect(box.x + box.w / 2).toBeLessThanOrEqual(100);
    expect(box.y + box.h / 2).toBeLessThanOrEqual(100);
  });

  it("випадковий мікро-рух не створює зону в піксель", () => {
    const box = boxFromDrag({ x: 50, y: 50 }, { x: 50.2, y: 50.1 }, "rect");
    expect(box.w).toBeGreaterThanOrEqual(2);
    expect(box.h).toBeGreaterThanOrEqual(2);
  });

  // Однакові відсотки по різних осях дають різні пікселі — на широкому
  // фото зона з w=h виглядала б приплюснутою, а не круглою.
  it("зона одним тапом виходить візуально квадратною", () => {
    const wide = tapBox({ x: 50, y: 50 }, "ellipse", 0.5); // висота вдвічі менша за ширину
    expect(wide.h).toBe(wide.w * 2);
    const tall = tapBox({ x: 50, y: 50 }, "ellipse", 2);
    expect(tall.h).toBe(wide.w / 2);
  });
});

describe("правка готової зони", () => {
  const box = { shape: "rect" as const, x: 50, y: 50, w: 20, h: 20 };

  it("перетягування не випускає зону за кадр", () => {
    expect(moveBox(box, 10, -10)).toMatchObject({ x: 60, y: 40 });
    expect(moveBox(box, 100, 0).x).toBe(90); // упирається half-width від краю
  });

  // Головне правило будь-якого редактора: тягнеш один кут — протилежний
  // стоїть. Інакше зона «тікає» з-під курсора.
  it("при зміні розміру протилежний кут лишається на місці", () => {
    const resized = resizeBox(box, "se", { x: 80, y: 90 });
    expect(resized.x - resized.w / 2).toBeCloseTo(40, 5); // лівий край не зрушив
    expect(resized.y - resized.h / 2).toBeCloseTo(40, 5); // верхній теж
    expect(resized.x + resized.w / 2).toBeCloseTo(80, 5);
    expect(resized.y + resized.h / 2).toBeCloseTo(90, 5);
  });

  it("кут можна протягнути за протилежний — рамка не вивертається", () => {
    const flipped = resizeBox(box, "se", { x: 10, y: 10 });
    expect(flipped.w).toBeGreaterThan(0);
    expect(flipped.h).toBeGreaterThan(0);
  });

  it("clampBox тримає і розмір, і центр у межах", () => {
    expect(clampBox({ x: 50, y: 50, w: 400, h: 0.1 })).toMatchObject({ w: 100, h: 2, x: 50 });
  });
});

describe("влучання", () => {
  const rect = { shape: "rect" as const, x: 50, y: 50, w: 40, h: 40 };
  const ellipse = { shape: "ellipse" as const, x: 50, y: 50, w: 40, h: 40 };

  it("прямокутник зараховує кут, еліпс — ні", () => {
    const corner = { x: 69, y: 69 }; // майже кут рамки
    expect(zoneContains(rect, corner, 1)).toBe(true);
    expect(zoneContains(ellipse, corner, 1)).toBe(false);
  });

  it("обидві фігури зараховують центр і відкидають далеке", () => {
    for (const zone of [rect, ellipse]) {
      expect(zoneContains(zone, { x: 50, y: 50 }, 1)).toBe(true);
      expect(zoneContains(zone, { x: 95, y: 50 }, 1)).toBe(false);
    }
  });

  // Рамка міряє кожну вісь своїм відсотком, тож пропорції кадру на неї не
  // впливають — на відміну від старого кола.
  it("рамці байдуже співвідношення сторін фото", () => {
    const point = { x: 50, y: 65 };
    expect(zoneContains(rect, point, 0.5)).toBe(zoneContains(rect, point, 2));
  });

  it("стара кругла зона працює як раніше, з поправкою на пропорції", () => {
    const circle = { x: 50, y: 50, r: 10 };
    expect(zoneContains(circle, { x: 50, y: 65 }, 0.5)).toBe(true);
    expect(zoneContains(circle, { x: 50, y: 65 }, 2)).toBe(false);
  });

  it("вироджена рамка нічого не зараховує", () => {
    expect(zoneContains({ shape: "rect", x: 50, y: 50, w: 0, h: 0 }, { x: 50, y: 50 }, 1)).toBe(false);
  });
});

describe("перенесення старої зони в нову модель", () => {
  it("коло стає рамкою того самого видимого розміру", () => {
    const box = toBox({ x: 50, y: 50, r: 10 }, 0.5);
    expect(box.w).toBe(20); // 2r по ширині
    expect(box.h).toBe(40); // на широкому фото ті самі пікселі — це 40% висоти
    expect(box.shape).toBe("ellipse");
  });

  it("рамку не чіпає", () => {
    const box = { shape: "rect" as const, x: 10, y: 10, w: 5, h: 5 };
    expect(toBox(box, 0.5)).toBe(box);
  });
});

describe("стиль рамки", () => {
  it("нова зона задає обидві осі у відсотках", () => {
    expect(zoneStyle({ shape: "rect", x: 25, y: 75, w: 10, h: 20 })).toEqual({
      left: "25%",
      top: "75%",
      width: "10%",
      height: "20%",
    });
  });

  it("стара зона лишається круглою через aspect-ratio", () => {
    expect(zoneStyle({ x: 50, y: 50, r: 8 })).toMatchObject({ width: "16%", aspectRatio: "1" });
  });
});

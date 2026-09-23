/**
 * Геометрія зон hotspot-питання: створення протяжкою, перетягування,
 * зміна розміру за кути й перевірка влучання. Чистий модуль із тестами —
 * рівно тому, що ця математика живе у ТРЬОХ місцях одразу (конструктор
 * малює зону, плеєр показує її після відповіді, isHotspotHit зараховує
 * влучання), і розійтись їм не можна: автор обвів одне, а зарахувалось би
 * інше.
 *
 * ДВІ моделі зони, обидві підтримуються назавжди:
 *
 *  - НОВА, «рамка»: { shape, x, y, w, h } — центр і розмір, усе у
 *    відсотках (w — від ШИРИНИ фото, h — від ВИСОТИ). shape вирішує лише
 *    те, як рамка читається: "rect" — прямокутник/квадрат, "ellipse" —
 *    овал/коло. Одна рамка дає всі чотири фігури, тож окремих типів під
 *    квадрат і коло не треба.
 *    Оскільки w і h міряються кожен по своїй осі, співвідношення сторін
 *    фото тут узагалі ні до чого — відсотки лягають на будь-який екран
 *    однаково.
 *
 *  - СТАРА, «коло»: { x, y, r } — центр і радіус у відсотках ШИРИНИ.
 *    Саме через один радіус на дві осі їй і потрібна поправка на
 *    співвідношення сторін, інакше коло на широкому фото зараховувало б
 *    еліпс. Зони, намальовані до 2026-09-23, лежать у базі саме такими —
 *    тому гілка лишається, а не «мігрується». Переходить у нову модель
 *    лише тоді, коли автор САМ її посуне чи розтягне (toBox нижче).
 */

export type HotspotShape = "rect" | "ellipse";

export type BoxZone = { shape?: HotspotShape; x: number; y: number; w: number; h: number };
export type CircleZone = { x: number; y: number; r?: number };
export type HotspotZone = BoxZone | CircleZone;
export type Point = { x: number; y: number };
export type Handle = "nw" | "ne" | "sw" | "se";

export const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];

/** Менша зона — це вже промах пальцем, а не питання на уважність. */
export const MIN_ZONE = 2;
/** Розмір зони, поставленої одним тапом (без протяжки), % ширини. */
export const TAP_ZONE_W = 16;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** 0.1% — і достатньо точно, і не засмічує JSON довгими хвостами. */
const round = (v: number) => Number(v.toFixed(1));

export function isBoxZone(zone: HotspotZone | null | undefined): zone is BoxZone {
  return Number.isFinite((zone as BoxZone)?.w) && Number.isFinite((zone as BoxZone)?.h);
}

/** Рамка цілком у межах кадру: спершу обмежуємо розмір, потім центр. */
export function clampBox(box: BoxZone): BoxZone {
  const w = clamp(box.w, MIN_ZONE, 100);
  const h = clamp(box.h, MIN_ZONE, 100);
  return {
    shape: box.shape,
    w: round(w),
    h: round(h),
    x: round(clamp(box.x, w / 2, 100 - w / 2)),
    y: round(clamp(box.y, h / 2, 100 - h / 2)),
  };
}

/** Дві довільні точки протяжки → нормалізована рамка (напрямок не важить). */
export function boxFromDrag(start: Point, end: Point, shape: HotspotShape): BoxZone {
  const x1 = clamp(Math.min(start.x, end.x), 0, 100);
  const x2 = clamp(Math.max(start.x, end.x), 0, 100);
  const y1 = clamp(Math.min(start.y, end.y), 0, 100);
  const y2 = clamp(Math.max(start.y, end.y), 0, 100);
  return clampBox({ shape, x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 });
}

/**
 * Зона одним тапом, без протяжки. aspect (висота/ширина кадру) потрібен,
 * щоб типова зона вийшла ВІЗУАЛЬНО квадратною/круглою: однакові відсотки
 * по різних осях дають різні пікселі.
 */
export function tapBox(at: Point, shape: HotspotShape, aspect: number): BoxZone {
  const w = TAP_ZONE_W;
  const h = Number.isFinite(aspect) && aspect > 0 ? w / aspect : w;
  return clampBox({ shape, x: at.x, y: at.y, w, h });
}

/** Стара кругла зона → рамка. Діаметр у відсотках ВИСОТИ = 2r / aspect. */
export function toBox(zone: HotspotZone, aspect: number): BoxZone {
  if (isBoxZone(zone)) return zone;
  const r = (zone as CircleZone).r ?? 8;
  const w = r * 2;
  const h = Number.isFinite(aspect) && aspect > 0 ? w / aspect : w;
  return clampBox({ shape: "ellipse", x: zone.x, y: zone.y, w, h });
}

export function moveBox(box: BoxZone, dx: number, dy: number): BoxZone {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy });
}

/**
 * Тягнемо за кут: протилежний кут стоїть на місці — звична поведінка
 * будь-якого графічного редактора. Через boxFromDrag, бо це рівно та сама
 * задача: «дві точки → рамка».
 */
export function resizeBox(box: BoxZone, handle: Handle, point: Point): BoxZone {
  const left = box.x - box.w / 2;
  const right = box.x + box.w / 2;
  const top = box.y - box.h / 2;
  const bottom = box.y + box.h / 2;
  const anchor = {
    x: handle === "nw" || handle === "sw" ? right : left,
    y: handle === "nw" || handle === "ne" ? bottom : top,
  };
  return boxFromDrag(anchor, point, box.shape ?? "rect");
}

/**
 * Чи точка всередині зони. aspectRatio (висота/ширина) потрібен ЛИШЕ
 * старим круглим зонам — у рамки кожна вісь міряється своїм відсотком.
 * Рамка без shape читається як еліпс: так поводились усі зони до появи
 * прямокутників.
 */
export function zoneContains(zone: HotspotZone, point: Point, aspectRatio: number): boolean {
  if (isBoxZone(zone)) {
    const halfW = zone.w / 2;
    const halfH = zone.h / 2;
    if (!(halfW > 0) || !(halfH > 0)) return false;
    const dx = (point.x - zone.x) / halfW;
    const dy = (point.y - zone.y) / halfH;
    if (zone.shape === "rect") return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    return dx * dx + dy * dy <= 1;
  }
  const circle = zone as CircleZone;
  const dx = point.x - circle.x;
  const dy = (point.y - circle.y) * aspectRatio;
  return Math.sqrt(dx * dx + dy * dy) <= (circle.r ?? 8);
}

/** Позиція й розмір рамки для CSS — однакові в конструкторі й у плеєрі. */
export function zoneStyle(zone: HotspotZone): Record<string, string> {
  if (isBoxZone(zone)) {
    return { left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` };
  }
  // Старе коло: один радіус на обидві осі, тож висоту тримає aspect-ratio.
  return { left: `${zone.x}%`, top: `${zone.y}%`, width: `${((zone as CircleZone).r ?? 8) * 2}%`, aspectRatio: "1" };
}

export function zoneShapeClass(zone: HotspotZone): string {
  return isBoxZone(zone) && zone.shape === "rect" ? "is-rect" : "is-ellipse";
}

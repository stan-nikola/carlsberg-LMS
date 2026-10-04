/**
 * Стандартні розміри карток дашборда керівника (2026-10-04, рішення
 * користувача: «універсальні розміри, щоб по 4/2/1 в ряд ставали один до
 * одного, без дір зверху й знизу»). Як цеглинки Lego:
 *  - ширина — лише ¼, ½ або вся ширина (3/6/12 колонок із 12);
 *  - висота — лише S або L, де L рівно дві S разом із проміжком між ними:
 *    дві S одна над одною поруч з однією L закінчуються на одній лінії.
 * Картка бере S, якщо її вміст уміщається, інакше L. Довші списки
 * прокручуються всередині (стеля в manager.css тримає їх у межах L).
 */

/** Висота картки S у px (без проміжків сітки) — вміщає «З першої спроби», «Стан команди», «Найскладніші питання» на ½ ширини (природні 245–271px) із запасом, щоб картка на межі не перескакувала S↔L від шрифту чи одного рядка даних. */
export const CARD_S_PX = 280;

/** Висота у клітинках сітки: S або L (= 2 × S разом із проміжком). */
export function standardRows(naturalPx: number, gapPx: number, cellPx: number): number {
  const sRows = Math.round((CARD_S_PX + gapPx) / cellPx);
  return naturalPx <= CARD_S_PX ? sRows : 2 * sRows;
}

/**
 * Чи є в розкладці «дірка»: вільна клітинка, під якою в тій самій колонці
 * ще стоїть картка. Гравітація gridstack піднімає картки лише вгору, не
 * вбік, тож після звуження картки поруч лишалась порожня ¼ (живий тест
 * 2026-10-04) — тоді розкладку треба ущільнити.
 */
export function hasHoles(nodes: { x: number; y: number; w: number; h: number }[], columns: number): boolean {
  for (let x = 0; x < columns; x++) {
    const inColumn = nodes.filter((n) => x >= n.x && x < n.x + n.w).sort((a, b) => a.y - b.y);
    let bottom = 0;
    for (const n of inColumn) {
      if (n.y > bottom) return true;
      bottom = Math.max(bottom, n.y + n.h);
    }
  }
  return false;
}

type Box = { id: string; x: number; y: number; w: number; h: number };
type Step = { id: string; x?: number; y?: number; w?: number; h?: number };

/**
 * Один крок «закрити діри» для вже ущільненої розкладки: дірка, яку
 * ущільнення не закрило (у ряду ширини не дають у сумі 12 — скажімо, п’ять
 * карток по ¼ — або поруч з L стоїть S і під нею порожньо), закривається
 * розтягуванням сусідньої картки:
 *  - вільне місце праворуч від картки на всю її висоту — ширшає до наступного
 *    стандарту (¼ → ½, ½ → уся), якщо він туди вміщається;
 *  - під карткою S порожньо на висоту ще однієї S, а нижче в цих колонках
 *    є картки або сусід по ряду (L) іде нижче — стає L;
 *  - далі bandJustifySteps і holeMoveSteps нижче.
 * Повертає зміни ОДНОГО виправлення (застосовувати всі, по порядку);
 * порожній список — розтягувати нічого.
 */
export function holeFillSteps(
  nodes: Box[],
  columns: number,
  sRows: number,
  minW: (id: string) => number = () => CARD_WIDTHS[0]
): Step[] {
  const taken = (x: number, y: number, self: Box) =>
    nodes.some((n) => n !== self && x >= n.x && x < n.x + n.w && y >= n.y && y < n.y + n.h);
  for (const n of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let free = 0;
    for (let x = n.x + n.w; x < columns; x++) {
      let clear = true;
      for (let y = n.y; y < n.y + n.h && clear; y++) if (taken(x, y, n)) clear = false;
      if (!clear) break;
      free++;
    }
    const wider = CARD_WIDTHS.filter((w) => w > n.w && w <= n.w + free && n.x + w <= columns);
    if (free > 0 && wider.length) return [{ id: n.id, w: wider[0] }];
  }
  // Розтягувати вгору-вниз — лише коли вшир нікому: ширина корисна вмісту,
  // зайва висота — порожнеча в картці.
  for (const n of [...nodes].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (n.h === sRows) {
      let emptyBelow = true;
      for (let x = n.x; x < n.x + n.w && emptyBelow; x++) {
        for (let y = n.y + sRows; y < n.y + 2 * sRows && emptyBelow; y++) if (taken(x, y, n)) emptyBelow = false;
      }
      const somethingLower = nodes.some((m) => m.y >= n.y + 2 * sRows && m.x < n.x + n.w && m.x + m.w > n.x);
      // Останній ряд дашборда: нижче нікого, але сусід по ряду (L) іде нижче —
      // під S лишився б порожній кут унизу сторінки.
      const neighbourLower = nodes.some((m) => m !== n && m.y <= n.y + sRows && m.y + m.h >= n.y + 2 * sRows);
      if (emptyBelow && (somethingLower || neighbourLower)) return [{ id: n.id, h: 2 * sRows }];
    }
  }
  const justify = bandJustifySteps(nodes, columns);
  if (justify.length) return justify;
  const move = holeMoveSteps(nodes, columns, minW);
  return move.length ? move : tailSteps(nodes, columns, sRows);
}

/**
 * Нерівний низ дашборда: в останній смузі колонки закінчуються на різній
 * висоті, а нижче нікого, хто закрив би кут (дві L і одна S у двох колонках
 * — непарна кількість «поверхів»). Карта S з цієї смуги їде в самий кінець на
 * всю ширину: L вирівнюються, S — смугою під ними.
 */
function tailSteps(nodes: Box[], columns: number, sRows: number): Step[] {
  const bottom = Math.max(...nodes.map((n) => n.y + n.h));
  const even = Array.from({ length: columns }, (_, x) =>
    Math.max(0, ...nodes.filter((n) => x >= n.x && x < n.x + n.w).map((n) => n.y + n.h))
  ).every((b) => b === bottom);
  if (even) return [];
  // Верх останньої смуги — та сама «смуга», що в bandJustifySteps.
  let bandTop = 0;
  let bandBottom = -1;
  for (const n of [...nodes].sort((a, b) => a.y - b.y)) {
    if (n.y >= bandBottom) bandTop = n.y;
    bandBottom = Math.max(bandBottom, n.y + n.h);
  }
  const s = nodes.filter((n) => n.h === sRows && n.w < columns && n.y >= bandTop).sort((a, b) => b.y - a.y)[0];
  return s ? [{ id: s.id, x: 0, y: bottom, w: columns }] : [];
}

/**
 * Смуга (картки, що перекриваються по висоті, — від верху першої до низу
 * найнижчої) з «колонок» (картки з тими самими x і w одна над одною), які не
 * добирають до повної ширини, а праворуч розширитись нікому (¼ + ½ + порожня
 * ¼: ½ → ¾ не буває; ¼ L поруч із двома S одна над одною) — одна з колонок
 * ширшає до наступного стандарту, решта зсуваються праворуч. Зміни справа
 * наліво, щоб кожна лягала на вже вільне місце й нікого не виштовхувала.
 */
function bandJustifySteps(nodes: Box[], columns: number): Step[] {
  const sorted = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  let i = 0;
  while (i < sorted.length) {
    const band = [sorted[i]];
    let bottom = sorted[i].y + sorted[i].h;
    for (i++; i < sorted.length && sorted[i].y < bottom; i++) {
      band.push(sorted[i]);
      bottom = Math.max(bottom, sorted[i].y + sorted[i].h);
    }
    const slots = new Map<string, Box[]>();
    for (const n of band) slots.set(`${n.x}:${n.w}`, [...(slots.get(`${n.x}:${n.w}`) || []), n]);
    const list = [...slots.values()].map((ns) => ({ x: ns[0].x, w: ns[0].w, ns })).sort((a, b) => a.x - b.x);
    if (list.some((slot, k) => k > 0 && slot.x < list[k - 1].x + list[k - 1].w)) continue;
    const rest = columns - list.reduce((sum, slot) => sum + slot.w, 0);
    if (rest <= 0) continue;
    const grow = [...list].reverse().find((slot) => CARD_WIDTHS.some((w) => w > slot.w && w - slot.w <= rest));
    if (!grow) continue;
    const newW = CARD_WIDTHS.find((w) => w > grow.w && w - grow.w <= rest)!;
    const steps: Step[] = [];
    let x = 0;
    for (const slot of list) {
      const w = slot === grow ? newW : slot.w;
      for (const n of slot.ns) if (n.x !== x || n.w !== w) steps.push({ id: n.id, x, w });
      x += w;
    }
    return steps.reverse();
  }
  return [];
}

/**
 * Діра, яку не закрило ні ущільнення, ні розтягування (наприклад, порожня
 * ½ під карткою L, а нижче лише картки на всю ширину): перша нижча картка, що
 * влазить у діру за висотою й може бути такою вузькою (не вужча за свій
 * мінімум), переїжджає в неї й звужується до її ширини.
 */
function holeMoveSteps(nodes: Box[], columns: number, minW: (id: string) => number): Step[] {
  const occ = (x: number, y: number) => nodes.some((n) => x >= n.x && x < n.x + n.w && y >= n.y && y < n.y + n.h);
  const nextBelow = (x: number, y: number) =>
    nodes.filter((n) => x >= n.x && x < n.x + n.w && n.y > y).reduce((m, n) => Math.min(m, n.y), Infinity);
  const ys = [...new Set([0, ...nodes.map((n) => n.y + n.h)])].sort((a, b) => a - b);
  for (const y of ys) {
    for (let x = 0; x < columns; x++) {
      if (occ(x, y) || nextBelow(x, y) === Infinity) continue;
      let w = 0;
      while (x + w < columns && !occ(x + w, y) && nextBelow(x + w, y) !== Infinity) w++;
      const h = Math.min(...Array.from({ length: w }, (_, k) => nextBelow(x + k, y))) - y;
      const fitW = [...CARD_WIDTHS].reverse().find((cw) => cw <= w);
      const mover = fitW
        ? [...nodes].filter((n) => n.y > y).sort((a, b) => a.y - b.y || a.x - b.x).find((n) => n.h <= h && minW(n.id) <= fitW)
        : undefined;
      if (mover && fitW) return [{ id: mover.id, x, y, w: fitW }];
      x += w - 1;
    }
  }
  return [];
}

/** Дозволені ширини у колонках із 12: ¼, ½, уся ширина. */
export const CARD_WIDTHS = [3, 6, 12] as const;

/** Найближча дозволена ширина, не вужча за мінімум картки. */
export function snapWidth(w: number, minW: number): number {
  const allowed = CARD_WIDTHS.filter((x) => x >= minW);
  return allowed.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best), allowed[0]);
}

/**
 * Діаграми для Excel-звіту керівника (app/api/manager/export) — чисті
 * SVG-рядки, які маршрут растеризує в PNG через sharp і кладе в лист
 * поруч із таблицею-джерелом (рішення користувача 2026-09-24: exceljs не
 * вміє писати справжні діаграми Excel, а data-bar замість кілець і
 * колонок читався бідно).
 *
 * НАВМИСНО БЕЗ ТЕКСТУ. sharp растеризує SVG через librsvg, а в
 * serverless-функції Vercel системних шрифтів немає — підписи
 * перетворились би на порожні прямокутники. Тому кожна діаграма — лише
 * форми й кольори, а підписи, значення й легенда живуть у клітинках
 * Excel поруч (їх видно, можна фільтрувати й рахувати формулами).
 * Кольори тут — ті самі бренд-токени, що в app/styles/tokens.css, лише
 * як hex: у SVG CSS-змінні застосунку недоступні.
 */

export const CHART_COLORS = {
  green: "#17B169",
  dark: "#00321E",
  blue: "#4B87C5",
  alert: "#F0B429",
  fail: "#D64545",
  track: "#E6EBEC",
  ink: "#212833",
} as const;

export type Bar = { value: number; color?: string };

const ROW_H = 26;
const BAR_H = 14;

function head(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

const safe = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);

/** Горизонтальні смуги, по одній на рядок таблиці поруч — рядок у рядок
 *  (та сама висота ROW_H, що й рядок Excel за замовчуванням ≈ 20pt). */
export function barsSvg(bars: Bar[], width = 360): string {
  const max = Math.max(1, ...bars.map((b) => safe(b.value)));
  const inner = width - 8;
  const body = bars
    .map((b, i) => {
      const y = i * ROW_H + (ROW_H - BAR_H) / 2;
      const w = Math.round((safe(b.value) / max) * inner);
      return (
        `<rect x="4" y="${y}" width="${inner}" height="${BAR_H}" rx="7" fill="${CHART_COLORS.track}"/>` +
        (w > 0 ? `<rect x="4" y="${y}" width="${Math.max(w, BAR_H)}" height="${BAR_H}" rx="7" fill="${b.color || CHART_COLORS.green}"/>` : "")
      );
    })
    .join("");
  return head(width, Math.max(1, bars.length) * ROW_H, body);
}

/** Вертикальні колонки — тренд по тижнях (зліва старіші). */
export function columnsSvg(values: number[], color = CHART_COLORS.dark, width = 360, height = 140): string {
  const max = Math.max(1, ...values.map(safe));
  const n = Math.max(1, values.length);
  const gap = 10;
  const colW = (width - gap * (n + 1)) / n;
  const baseY = height - 6;
  const body = values
    .map((v, i) => {
      // Мінімум 12px (2×rx): нижча колонка з заокругленням 6 рендериться
      // сплющеною цяткою — «4 модулі» поруч зі «150» мають лишатись видимими.
      const h = safe(v) > 0 ? Math.max(12, Math.round(((baseY - 8) * safe(v)) / max)) : 0;
      const x = gap + i * (colW + gap);
      return (
        `<rect x="${x}" y="${8}" width="${colW}" height="${baseY - 8}" rx="6" fill="${CHART_COLORS.track}"/>` +
        (h > 0 ? `<rect x="${x}" y="${baseY - h}" width="${colW}" height="${h}" rx="6" fill="${color}"/>` : "")
      );
    })
    .join("");
  return head(width, height, body + `<rect x="0" y="${baseY}" width="${width}" height="2" fill="${CHART_COLORS.track}"/>`);
}

/** Кільце-прогрес: частка pct зафарбована кольором, решта — доріжка. */
function ringPath(cx: number, cy: number, r: number, pct: number, color: string, stroke = 14): string {
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, safe(pct)) / 100) * c;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CHART_COLORS.track}" stroke-width="${stroke}"/>` +
    (filled > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`
      : "")
  );
}

export function ringsSvg(rings: { pct: number; color: string }[], size = 110): string {
  const n = Math.max(1, rings.length);
  const gap = 16;
  const width = n * size + (n + 1) * gap;
  const body = rings.map((r, i) => ringPath(gap + i * (size + gap) + size / 2, size / 2 + 4, size / 2 - 10, r.pct, r.color)).join("");
  return head(width, size + 8, body);
}

export function donutSvg(pct: number, color = CHART_COLORS.green, size = 140): string {
  return head(size, size, ringPath(size / 2, size / 2, size / 2 - 12, pct, color, 18));
}

/** Одна складена смуга — «Стан команди»: сегменти в порядку масиву. */
export function stackedBarSvg(segments: { count: number; color: string }[], width = 360, height = 28): string {
  const total = segments.reduce((s, x) => s + safe(x.count), 0);
  if (total === 0) return head(width, height, `<rect x="0" y="4" width="${width}" height="${height - 8}" rx="8" fill="${CHART_COLORS.track}"/>`);
  let x = 0;
  const parts = segments
    .filter((s) => safe(s.count) > 0)
    .map((s) => {
      const w = (safe(s.count) / total) * width;
      const rect = `<rect x="${x.toFixed(1)}" y="4" width="${w.toFixed(1)}" height="${height - 8}" fill="${s.color}"/>`;
      x += w;
      return rect;
    })
    .join("");
  return head(
    width,
    height,
    `<clipPath id="c"><rect x="0" y="4" width="${width}" height="${height - 8}" rx="8"/></clipPath><g clip-path="url(#c)">${parts}</g>`
  );
}

/**
 * Розміри колонок і рядків будь-якої таблиці застосунку «як у Excel»
 * (2026-10-05, components/app/TableSizes.tsx). Чиста частина: ключ таблиці,
 * межі, (де)серіалізація — тест без DOM. Той самий підхід, що вже в
 * матриці (lib/matrixSizes.ts) і журналі дій — тепер для решти таблиць.
 */

export const COL = { min: 48, max: 640 } as const;
export const ROW = { min: 24, max: 240 } as const;

export type TableSizes = { cols: Record<string, number>; rows: Record<string, number> };
export type SizesStore = Record<string, TableSizes>;

export const clamp = (px: number, lim: { min: number; max: number }) => Math.min(lim.max, Math.max(lim.min, Math.round(px)));

/**
 * Ключ таблиці: шлях без id (/admin/employees/42 → /admin/employees/:id),
 * порядковий номер таблиці на сторінці і заголовки колонок — та сама
 * таблиця на картці будь-якого співробітника ділить розміри, а інша
 * таблиця з іншими колонками — ні.
 */
export function tableKey(pathname: string, index: number, headers: string[]): string {
  const path = pathname.replace(/\/\d+(?=\/|$)/g, "/:id").replace(/\/+$/, "") || "/";
  const head = headers.map((h) => h.trim().replace(/\s+/g, " ").slice(0, 24)).join("|");
  return `${path}#${index}:${head}`;
}

/** Читання сховища: сміття відкидається по полю, а не все разом. */
export function parseStore(raw: string | null | undefined): SizesStore {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const pick = (v: unknown, lim: { min: number; max: number }) => {
    const out: Record<string, number> = {};
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n)) out[k] = clamp(n, lim);
    }
    return out;
  };
  const store: SizesStore = {};
  for (const [key, t] of Object.entries(parsed as Record<string, unknown>)) {
    if (!t || typeof t !== "object") continue;
    const s = { cols: pick((t as TableSizes).cols, COL), rows: pick((t as TableSizes).rows, ROW) };
    if (Object.keys(s.cols).length || Object.keys(s.rows).length) store[key] = s;
  }
  return store;
}

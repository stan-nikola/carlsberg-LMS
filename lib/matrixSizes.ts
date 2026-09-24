/**
 * Розміри колонок і рядків матриці «люди × курси» (components/TeamMatrix.tsx),
 * які керівник тягне за межі клітинок, «як у Excel» (2026-09-24). Чиста
 * арифметика й (де)серіалізація — окремо від компонента, щоб її можна
 * було перевірити тестом без DOM.
 *
 * Зберігається в localStorage браузера (рішення користувача — як і
 * розкладка карток дашборда), ключі — slug курсу та id людини, тож нові
 * курси/люди отримують дефолт, а перейменований курс лишає свою ширину.
 */

export const MATRIX_SIZE = {
  /** Колонка з іменами (липка). */
  name: { def: 150, min: 90, max: 320 },
  /** Колонка курсу — під дворядковий горизонтальний підпис. */
  col: { def: 96, min: 44, max: 320 },
  /** Рядок людини. */
  row: { def: 32, min: 24, max: 96 },
} as const;

export type MatrixSizeKind = keyof typeof MATRIX_SIZE;

export type MatrixSizes = {
  name?: number;
  cols: Record<string, number>;
  rows: Record<string, number>;
};

export const EMPTY_SIZES: MatrixSizes = { cols: {}, rows: {} };

export function clampSize(kind: MatrixSizeKind, px: number): number {
  const { min, max } = MATRIX_SIZE[kind];
  return Math.min(max, Math.max(min, Math.round(px)));
}

/** Новий розмір після протягування на `delta` px від початкових `start`. */
export function resizedTo(kind: MatrixSizeKind, start: number, delta: number): number {
  return clampSize(kind, start + delta);
}

/** Розмір із збереженого стану або дефолт. */
export function sizeOf(sizes: MatrixSizes, kind: MatrixSizeKind, key?: string): number {
  if (kind === "name") return sizes.name ?? MATRIX_SIZE.name.def;
  const bag = kind === "col" ? sizes.cols : sizes.rows;
  return (key && bag[key]) || MATRIX_SIZE[kind].def;
}

/** Повертає новий стан із заміненим розміром; `null` — скинути до дефолту. */
export function withSize(sizes: MatrixSizes, kind: MatrixSizeKind, key: string, px: number | null): MatrixSizes {
  if (kind === "name") {
    const { name: _drop, ...rest } = sizes;
    return px == null ? rest : { ...rest, name: clampSize("name", px) };
  }
  const field = kind === "col" ? "cols" : "rows";
  const bag = { ...sizes[field] };
  if (px == null) delete bag[key];
  else bag[key] = clampSize(kind, px);
  return { ...sizes, [field]: bag };
}

/**
 * Читання зі сховища: будь-яке сміття (стара версія, ручна правка,
 * не-число) відкидається по полю, а не валить усе — краще дефолтна ширина
 * однієї колонки, ніж матриця без збережених розмірів узагалі.
 */
export function parseSizes(raw: string | null | undefined): MatrixSizes {
  if (!raw) return EMPTY_SIZES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_SIZES;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_SIZES;
  const obj = parsed as Record<string, unknown>;
  const pick = (kind: "col" | "row", value: unknown): Record<string, number> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = clampSize(kind, v);
    }
    return out;
  };
  const result: MatrixSizes = { cols: pick("col", obj.cols), rows: pick("row", obj.rows) };
  if (typeof obj.name === "number" && Number.isFinite(obj.name)) result.name = clampSize("name", obj.name);
  return result;
}

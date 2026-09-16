/**
 * Регульовані токени дизайн-системи (app/styles/tokens.css) — те, що крутить
 * стенд /admin/design (components/DesignStand.tsx). Кольори сюди свідомо не
 * входять (рішення користувача 2026-09-16: кольори не чіпаємо).
 *
 * Стенд пише значення в localStorage і на :root цього браузера
 * (DesignTokensOverride у app/layout.js), тобто це ПРЕВ’Ю: обраний набір
 * копіюють кнопкою «Скопіювати :root» і вписують у tokens.css руками —
 * саме так значення стають дефолтом для всіх.
 */
export type TokenDef =
  | { key: string; label: string; group: string; kind: "px"; min: number; max: number; step?: number; def: number }
  | { key: string; label: string; group: string; kind: "choice"; choices: { label: string; value: string }[]; def: string };

export const STORAGE_KEY = "carls-design-overrides";

export const DESIGN_TOKENS: TokenDef[] = [
  { key: "radius-btn", label: "Кнопки", group: "Радіуси", kind: "px", min: 0, max: 24, def: 0 },
  { key: "radius-card", label: "Картки, таблиці, модалки", group: "Радіуси", kind: "px", min: 0, max: 24, def: 0 },
  { key: "radius-input", label: "Поля вводу", group: "Радіуси", kind: "px", min: 0, max: 16, def: 7 },
  {
    key: "radius-badge",
    label: "Бейджі та статуси",
    group: "Радіуси",
    kind: "choice",
    choices: [
      { label: "Пілюля", value: "var(--radius-pill)" },
      { label: "Як кнопки", value: "var(--radius-btn)" },
      { label: "Як поля", value: "var(--radius-input)" },
    ],
    def: "var(--radius-pill)",
  },
  { key: "btn-h-sm", label: "Мала (адмінка, рядки)", group: "Висота кнопок", kind: "px", min: 26, max: 40, def: 32 },
  { key: "btn-h-md", label: "Середня (картки, перемикачі)", group: "Висота кнопок", kind: "px", min: 32, max: 48, def: 40 },
  { key: "btn-h-lg", label: "Велика (телефон, на всю ширину)", group: "Висота кнопок", kind: "px", min: 44, max: 60, def: 52 },
  { key: "iconbtn-sm", label: "Іконкова мала", group: "Висота кнопок", kind: "px", min: 22, max: 34, def: 28 },
  { key: "iconbtn-md", label: "Іконкова середня", group: "Висота кнопок", kind: "px", min: 30, max: 44, def: 34 },
  {
    key: "border-w",
    label: "Товщина рамок",
    group: "Рамки і тіні",
    kind: "choice",
    choices: [
      { label: "1px", value: "1px" },
      { label: "1.5px", value: "1.5px" },
      { label: "2px", value: "2px" },
    ],
    def: "1px",
  },
  {
    key: "card-shadow",
    label: "Тінь карток",
    group: "Рамки і тіні",
    kind: "choice",
    choices: [
      { label: "Без тіні", value: "none" },
      { label: "Легка (resting)", value: "var(--shadow-resting)" },
      { label: "Помітна (hovered)", value: "var(--shadow-hovered)" },
    ],
    def: "none",
  },
  { key: "card-pad-y", label: "Картка: відступ зверху/знизу", group: "Відступи", kind: "px", min: 8, max: 24, def: 14 },
  { key: "card-pad-x", label: "Картка: відступ з боків", group: "Відступи", kind: "px", min: 8, max: 28, def: 16 },
  { key: "table-cell-y", label: "Таблиця: висота рядка", group: "Відступи", kind: "px", min: 6, max: 16, def: 10 },
];

export type TokenValues = Record<string, string>;

export function defaultValues(): TokenValues {
  return Object.fromEntries(DESIGN_TOKENS.map((t) => [t.key, t.kind === "px" ? `${t.def}px` : t.def]));
}

/** Виставити/зняти змінні на <html>: порожній об’єкт = дефолти з tokens.css. */
export function applyOverrides(values: TokenValues) {
  const root = document.documentElement.style;
  for (const t of DESIGN_TOKENS) {
    const v = values[t.key];
    if (v) root.setProperty(`--${t.key}`, v);
    else root.removeProperty(`--${t.key}`);
  }
}

export function readOverrides(): TokenValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenValues) : {};
  } catch {
    return {};
  }
}

export function writeOverrides(values: TokenValues) {
  try {
    if (Object.keys(values).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // приватний режим — прев’ю живе до перезавантаження
  }
}

/** Блок для вставки в tokens.css — лише те, що відрізняється від дефолту. */
export function toCss(values: TokenValues): string {
  const defs = defaultValues();
  const lines = DESIGN_TOKENS.filter((t) => values[t.key] && values[t.key] !== defs[t.key]).map((t) => `  --${t.key}: ${values[t.key]};`);
  return lines.length ? `:root {\n${lines.join("\n")}\n}` : "/* усе як у tokens.css */";
}

/**
 * Готові системи — стартова точка для регуляторів (радіокнопки на стенді):
 * обрав систему, далі підкручуєш. Значення — з публічних гайдлайнів,
 * приведені до наших токенів (кольори не входять). Дефолт tokens.css =
 * «Malty (Carlsberg)».
 */
export type DesignPreset = { key: string; label: string; hint: string; values: TokenValues };

const px = (n: number) => `${n}px`;
export const DESIGN_PRESETS: DesignPreset[] = [
  {
    key: "malty",
    label: "Malty (Carlsberg)",
    hint: "Фірмова: прямокутні кнопки й картки, поля 7px, без тіней. Поточний дефолт.",
    values: {},
  },
  {
    key: "ios",
    label: "iOS (Apple HIG)",
    hint: "М’які кути 12–16px, кнопки не нижчі 44px, тонкі рамки-роздільники, без тіней.",
    values: {
      "radius-btn": px(12), "radius-card": px(16), "radius-input": px(10), "radius-badge": "var(--radius-pill)",
      "btn-h-sm": px(32), "btn-h-md": px(44), "btn-h-lg": px(50), "iconbtn-sm": px(28), "iconbtn-md": px(36),
      "border-w": "1px", "card-shadow": "none", "card-pad-y": px(14), "card-pad-x": px(16), "table-cell-y": px(11),
    },
  },
  {
    key: "fluent",
    label: "Windows (Fluent 2)",
    hint: "Ледь помітні кути 4–8px, компактні кнопки 32px, легка тінь карток, щільні рядки.",
    values: {
      "radius-btn": px(4), "radius-card": px(8), "radius-input": px(4), "radius-badge": "var(--radius-pill)",
      "btn-h-sm": px(32), "btn-h-md": px(32), "btn-h-lg": px(44), "iconbtn-sm": px(28), "iconbtn-md": px(32),
      "border-w": "1px", "card-shadow": "var(--shadow-resting)", "card-pad-y": px(12), "card-pad-x": px(16), "table-cell-y": px(8),
    },
  },
  {
    key: "material",
    label: "Android (Material 3)",
    hint: "Кнопки-пілюлі, картки 12px, поля 4px, підняті картки з тінню, рядки 52px.",
    values: {
      "radius-btn": px(20), "radius-card": px(12), "radius-input": px(4), "radius-badge": "var(--radius-pill)",
      "btn-h-sm": px(32), "btn-h-md": px(40), "btn-h-lg": px(56), "iconbtn-sm": px(28), "iconbtn-md": px(40),
      "border-w": "1px", "card-shadow": "var(--shadow-resting)", "card-pad-y": px(16), "card-pad-x": px(16), "table-cell-y": px(12),
    },
  },
  {
    key: "bootstrap",
    label: "Bootstrap 5",
    hint: "Класичний веб: кути 6–8px, кнопки 31/38/48, рамки 1px, без тіней.",
    values: {
      "radius-btn": px(6), "radius-card": px(8), "radius-input": px(6), "radius-badge": "var(--radius-btn)",
      "btn-h-sm": px(31), "btn-h-md": px(38), "btn-h-lg": px(48), "iconbtn-sm": px(28), "iconbtn-md": px(38),
      "border-w": "1px", "card-shadow": "none", "card-pad-y": px(16), "card-pad-x": px(16), "table-cell-y": px(8),
    },
  },
  {
    key: "shadcn",
    label: "shadcn/ui (Tailwind)",
    hint: "Сучасні SaaS-адмінки: кути 6–8px, кнопки 32/36/40, тонкі рамки, легка тінь.",
    values: {
      "radius-btn": px(6), "radius-card": px(8), "radius-input": px(6), "radius-badge": "var(--radius-pill)",
      "btn-h-sm": px(32), "btn-h-md": px(36), "btn-h-lg": px(44), "iconbtn-sm": px(28), "iconbtn-md": px(36),
      "border-w": "1px", "card-shadow": "var(--shadow-resting)", "card-pad-y": px(16), "card-pad-x": px(20), "table-cell-y": px(10),
    },
  },
];

/** Ключ системи, яка точно збігається з поточними значеннями, або null (власні). */
export function matchPreset(values: TokenValues): string | null {
  const defs = defaultValues();
  for (const p of DESIGN_PRESETS) {
    const full = { ...defs, ...p.values };
    if (DESIGN_TOKENS.every((t) => (values[t.key] || defs[t.key]) === full[t.key])) return p.key;
  }
  return null;
}

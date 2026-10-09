/**
 * Регульовані токени дизайн-системи (app/styles/tokens.css) — те, що крутить
 * стенд /admin/design (components/admin/DesignStand.tsx). Кольори загалом сюди не
 * входять (рішення користувача 2026-09-16) — крім кольорів великих помітних
 * елементів хабу й кабінету керівника (2026-10-04): кожному свій колір і
 * вигляд із палітри Carlsberg Group design guide (lib/accentPalette.ts).
 * Готові системи їх не чіпають.
 *
 * Стенд пише значення в localStorage і на :root цього браузера
 * (DesignTokensOverride у app/layout.js), тобто це ПРЕВ’Ю: обраний набір
 * копіюють кнопкою «Скопіювати :root» і вписують у tokens.css руками —
 * саме так значення стають дефолтом для всіх.
 */
export type TokenDef =
  | { key: string; label: string; group: string; kind: "px"; min: number; max: number; step?: number; def: number }
  | { key: string; label: string; group: string; kind: "choice"; choices: { label: string; value: string }[]; def: string };

/**
 * Кольори великих елементів — палітра, стилі й токени в lib/accentPalette.ts
 * (конструктор CarLS Accents, вибір користувача 2026-10-04). Тут лише група
 * для whitelist і стенду.
 */
export const ACCENT_GROUP = "Кольори елементів";
export {
  ACCENT_COLORS,
  ACCENT_ELEMENTS,
  ACCENT_FAMILIES,
  ACCENT_SHADES,
  ACCENT_EXTRA_IDS,
  STYLE_LABEL,
  accentTokenValues,
  allAccentValues,
  colorById,
  readAccent,
  type AccentElement,
  type AccentStyle,
} from "@/lib/accentPalette";
import { accentTokenDefs } from "@/lib/accentPalette";

/**
 * «Сприйняття кольорів» (2026-10-04): рекомендації за WCAG 2.2 і для
 * дальтоніків, що НЕ виходять за палітру Malty — де колір погано читається,
 * беремо темніший відтінок того ж кольору (так уже зроблено пілюлі статусів).
 * Кожна — «як зараз» / «рекомендовано»; дефолт = як зараз (tokens.css --p-*).
 * Контраст — відношення яскравостей за WCAG (текст ≥ 4.5, великі цифри й
 * рамки полів ≥ 3). Лише хаб, кабінет керівника й плеєр.
 */
export const PERCEPTION_GROUP = "Сприйняття";
const MIX_BLACK = (v: string, p: number) => `color-mix(in srgb, var(--${v}) ${p}%, var(--cb-black))`;
export const PERCEPTION_FIXES = [
  {
    id: "danger-text",
    area: "Читаємість",
    title: "Червоний текст: «Прострочено», «Видалити», помилки",
    problem: "Яскравий червоний на білому — 3.2:1, менше норми 4.5 для тексту. Тепер — темніший відтінок того ж червоного.",
    contrast: [3.16, 4.65],
    tokens: { "p-danger-text": ["var(--danger)", MIX_BLACK("cb-fail", 75)] },
  },
  {
    id: "accent-text",
    area: "Читаємість",
    title: "Зелений текст: позначка «Новий», активна іконка меню",
    problem: "Акцентний зелений як текст — 2.8:1, майже не читається дрібним. Тепер — глибший відтінок того ж зеленого.",
    contrast: [2.79, 4.86],
    tokens: { "p-accent-text": ["var(--cb-secondary)", MIX_BLACK("cb-secondary", 65)] },
  },
  {
    id: "alert-pill",
    area: "Читаємість",
    title: "Пілюля «Відстає»",
    problem: "Текст на жовтому фоні — 3.4:1. Тепер — темніший жовто-коричневий того ж тону.",
    contrast: [3.41, 4.88],
    tokens: { "p-alert-pill-text": [MIX_BLACK("cb-alert", 55), MIX_BLACK("cb-alert", 40)] },
  },
  {
    id: "fail-solid",
    area: "Читаємість",
    title: "Білі цифри на червоному: полоса «Стан команди», матриця, лічильник дзвоника",
    problem: "Білий на яскраво-червоному — 3.2:1. Фон стає на тон темнішим, цифри лишаються білими.",
    contrast: [3.16, 4.65],
    tokens: { "p-fail-solid": ["var(--cb-fail)", MIX_BLACK("cb-fail", 75)] },
  },
  {
    id: "info-solid",
    area: "Читаємість",
    title: "Білий на синьому: «Доступно» в плані, «В процесі» в матриці",
    problem: "Білий на синьому — 3.8:1. Фон на тон темніший, значки й цифри лишаються білими.",
    contrast: [3.77, 4.56],
    tokens: { "p-info-solid": ["var(--cb-notification)", MIX_BLACK("cb-notification", 85)] },
  },
  {
    id: "failed-amber",
    area: "Зміст статусів",
    title: "«Не складено» в матриці — бурштиновий, як у плані курсу",
    problem: "План курсу фарбує провалений модуль бурштиновим («спробуй ще раз»), а матриця керівника — червоним, як прострочення. Один стан — один колір. Світлий бурштиновий, щоб не злитися з насиченим жовтим «Відстає».",
    contrast: null,
    tokens: { "p-failed-cell-bg": ["var(--p-fail-solid)", "var(--cb-alert-light)"], "p-failed-cell-ink": ["var(--cb-white)", `color-mix(in srgb, var(--cb-alert) 40%, var(--cb-black))`] },
  },
  {
    id: "notstarted-grey",
    area: "Зміст статусів",
    title: "«Не почали» в полосі команди — сірий",
    problem: "Синій тут означає і «не почали», і «доступно», і «в процесі». Сірий «не почали» — як у матриці; синій лишається для «в роботі».",
    contrast: null,
    tokens: { "p-notstarted-bg": ["var(--p-info-solid)", "var(--cb-support-60)"], "p-notstarted-ink": ["var(--cb-white)", "var(--ink)"] },
  },
  {
    id: "inactive-hatch",
    area: "Зміст статусів",
    title: "«Неактивні» — червоне штрихування",
    problem: "«Неактивні» й «Прострочено» — однаковий червоний, на полосі їх не розрізнити. Штрихування того ж червоного: так само «проблема», але інша.",
    contrast: null,
    tokens: {
      "p-inactive-bg": ["var(--p-fail-solid)", `repeating-linear-gradient(135deg, var(--p-fail-solid) 0 6px, ${MIX_BLACK("cb-fail", 55)} 6px 12px)`],
    },
  },
  {
    id: "glyphs",
    area: "Дальтонізм",
    title: "Значки на пілюлях статусу: ✓ ! ⏱",
    problem: "~8% чоловіків погано розрізняють червоний і зелений: «Складено» й «Не складено» для них — дві однакові плашки. Значок дублює колір (лише де своєї іконки нема).",
    contrast: null,
    tokens: { "p-glyph-success": ["none", '"✓"'], "p-glyph-fail": ["none", '"!"'], "p-glyph-alert": ["none", '"⏱"'] },
  },
  {
    id: "input-border",
    area: "Рамки й поля",
    title: "Рамки полів пошуку й вводу",
    problem: "Світла рамка поля — 1.3:1, поле зливається з фоном і не видно, куди вводити (норма для меж полів — 3:1). Тепер — Malty support-80.",
    contrast: [1.34, 3.97],
    tokens: { "p-input-border": ["var(--line)", "var(--cb-support-80)"] },
  },
] as const;
export type PerceptionFix = (typeof PERCEPTION_FIXES)[number]["id"];

/** Значення токенів рекомендації: on — «рекомендовано», інакше — як зараз. */
export function perceptionValues(id: PerceptionFix, on: boolean): TokenValues {
  const fix = PERCEPTION_FIXES.find((f) => f.id === id)!;
  return Object.fromEntries(Object.entries(fix.tokens).map(([k, [now, rec]]) => [k, on ? rec : now]));
}
export function readPerception(id: PerceptionFix, values: TokenValues): boolean {
  return Object.entries(perceptionValues(id, true)).every(([k, v]) => values[k] === v);
}
function perceptionTokenDefs(): TokenDef[] {
  return PERCEPTION_FIXES.flatMap((f) =>
    Object.entries(f.tokens).map(([key, [now, rec]]) => ({
      key,
      label: f.title,
      group: PERCEPTION_GROUP,
      kind: "choice" as const,
      choices: [
        { label: "Як зараз", value: now },
        { label: "Рекомендовано", value: rec },
      ],
      def: now,
    }))
  );
}

export const STORAGE_KEY = "carls-design-overrides";

export const DESIGN_TOKENS: TokenDef[] = [
  ...accentTokenDefs(ACCENT_GROUP),
  ...perceptionTokenDefs(),
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
  // Смуга заввишки 8px: радіус понад 4px браузер усе одно обріже до
  // половини висоти, тому max саме 4 — щоб повзунок не мав мертвої зони.
  { key: "chart-bar-radius", label: "Смуги: заокруглення кінців", group: "Діаграми", kind: "px", min: 0, max: 4, def: 4 },
  { key: "chart-ring-w", label: "Кільця: товщина", group: "Діаграми", kind: "px", min: 6, max: 20, def: 14 },
  {
    key: "chart-ring-cap",
    label: "Кільця: кінці дуги",
    group: "Діаграми",
    kind: "choice",
    choices: [
      { label: "Заокруглені", value: "round" },
      { label: "Прямі (точніше передають частку)", value: "butt" },
    ],
    def: "round",
  },
  // Капсула-індикатор нав-таббару (.tab-pill, app/styles/hub.css) —
  // "choice", не новий kind "ms": стенд поки рендерить лише px-повзунок і
  // choice-випадайку (components/admin/DesignStand.tsx), додавати третій вид
  // заради двох токенів — окрема робота понад цю задачу.
  {
    key: "tab-pill-duration",
    label: "Капсула нав-таббару: тривалість",
    group: "Рух",
    kind: "choice",
    choices: [
      { label: "Швидко (220мс)", value: "220ms" },
      { label: "Помірно (340мс) — дефолт", value: "340ms" },
      { label: "Повільно (480мс)", value: "480ms" },
    ],
    def: "340ms",
  },
  {
    key: "tab-pill-ease",
    label: "Капсула нав-таббару: характер руху",
    group: "Рух",
    kind: "choice",
    choices: [
      { label: "Спокійно, без перельоту", value: "var(--ease-premium)" },
      { label: "Пружно, з перельотом — дефолт", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
      { label: "Виражений відскок", value: "cubic-bezier(0.34, 2.2, 0.64, 1)" },
    ],
    def: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
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
      "chart-bar-radius": px(4), "chart-ring-w": px(12), "chart-ring-cap": "round",
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
      "chart-bar-radius": px(2), "chart-ring-w": px(12), "chart-ring-cap": "butt",
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
      "chart-bar-radius": px(4), "chart-ring-w": px(14), "chart-ring-cap": "round",
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
      "chart-bar-radius": px(0), "chart-ring-w": px(14), "chart-ring-cap": "butt",
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
      "chart-bar-radius": px(4), "chart-ring-w": px(10), "chart-ring-cap": "round",
    },
  },
];

/** Ключ системи, яка точно збігається з поточними значеннями, або null (власні). */
export function matchPreset(values: TokenValues): string | null {
  const defs = defaultValues();
  for (const p of DESIGN_PRESETS) {
    const full = { ...defs, ...p.values };
    // Акценти — не частина системи: обрані кольори не скасовують «Malty».
    if (DESIGN_TOKENS.filter((t) => t.group !== ACCENT_GROUP && t.group !== PERCEPTION_GROUP).every((t) => (values[t.key] || defs[t.key]) === full[t.key])) return p.key;
  }
  return null;
}

/**
 * Кольори великих помітних елементів хабу й кабінету керівника (2026-10-04,
 * конструктор кольорів CarLS → /admin/design «Кольори елементів»).
 *
 * Палітра — лише Carlsberg Group design guide: сім вторинних кольорів у трьох
 * відтінках (світлий = 55% кольору з білим, основний, глибокий = 70% кольору з
 * digital-black), плюс фірмовий Carlsberg green і сірі Malty. Кожен елемент
 * має колір і стиль (заливка / тон / контур / градієнт / плоска — лише ті, що
 * мають сенс для нього). Текст і значок на кольорі підбираються самі за
 * контрастом WCAG (той самий розрахунок, що в конструкторі), тож вибір у
 * конструкторі = те, що бачить застосунок.
 *
 * Токени елемента: `--accent-<id>` (сам колір: тінь, рамка, пульсація),
 * `-bg`, `-fg`, `-bd`. Дефолти ДУБЛЮЮТЬСЯ в app/styles/tokens.css —
 * accentPalette.test.ts звіряє їх.
 */
type TokenValues = Record<string, string>;
type ChoiceDef = { key: string; label: string; group: string; kind: "choice"; choices: { label: string; value: string }[]; def: string };

/* ---- математика кольору (sRGB, WCAG 2.x) ---- */
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a: number[]) => "#" + a.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** p — частка кольору a (як `color-mix(in srgb, a p%, b)`). */
export const mixHex = (a: string, b: string, p: number) => toHex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
const lum = (h: string) =>
  rgb(h)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const BLACK = "#212833";
const WHITE = "#ffffff";
export const HERO_HEX = "#00321e";
const mixCss = (css: string, p: number, with_: "white" | "black") => `color-mix(in srgb, ${css} ${p}%, var(--cb-${with_}))`;

/* ---- палітра ---- */
export type AccentFamily = "gold" | "teal" | "blue" | "green" | "salmon" | "yellow" | "burgundy" | "brand" | "grey";
const BASE = [
  { fam: "gold", label: "Золото", hex: "#b49132", css: "var(--cb-tertiary)" },
  { fam: "teal", label: "Бірюзовий", hex: "#14a5b9", css: "var(--cb-brand-teal)" },
  { fam: "blue", label: "Синій", hex: "#1e64aa", css: "var(--cb-brand-blue)" },
  { fam: "green", label: "Зелений", hex: "#17b169", css: "var(--cb-secondary)" },
  { fam: "salmon", label: "Лососевий", hex: "#f5a596", css: "var(--cb-brand-salmon)" },
  { fam: "yellow", label: "Жовтий", hex: "#ffb400", css: "var(--cb-brand-yellow)" },
  { fam: "burgundy", label: "Бордовий", hex: "#78283a", css: "var(--cb-brand-burgundy)" },
] as const;
export const ACCENT_FAMILIES = BASE.map((b) => ({ fam: b.fam as AccentFamily, label: b.label, hex: b.hex }));
export const ACCENT_SHADES = [
  { key: "light", label: "світлий" },
  { key: "main", label: "основний" },
  { key: "deep", label: "глибокий" },
] as const;
export type AccentColor = { id: string; fam: AccentFamily; label: string; css: string; hex: string };
export const ACCENT_COLORS: AccentColor[] = [
  ...BASE.flatMap((b) => [
    { id: `${b.fam}-light`, fam: b.fam, label: `${b.label}, світлий`, css: mixCss(b.css, 55, "white"), hex: mixHex(b.hex, WHITE, 0.55) },
    { id: `${b.fam}-main`, fam: b.fam, label: `${b.label}, основний`, css: b.css, hex: b.hex },
    { id: `${b.fam}-deep`, fam: b.fam, label: `${b.label}, глибокий`, css: mixCss(b.css, 70, "black"), hex: mixHex(b.hex, BLACK, 0.7) },
  ]),
  { id: "brand-green", fam: "brand", label: "Carlsberg green", css: "var(--cb-primary)", hex: "#00321e" },
  { id: "grey-100", fam: "grey", label: "Сірий Malty 100", css: "var(--cb-support-100)", hex: "#314550" },
  { id: "grey-80", fam: "grey", label: "Сірий Malty 80", css: "var(--cb-support-80)", hex: "#668494" },
  { id: "grey-60", fam: "grey", label: "Сірий Malty 60", css: "var(--cb-support-60)", hex: "#9db3bf" },
];
export const ACCENT_EXTRA_IDS = ["brand-green", "grey-100", "grey-80", "grey-60"];
export const colorById = (id: string) => ACCENT_COLORS.find((c) => c.id === id);

/* ---- текст на кольорі ---- */
/** Білий або темний відтінок того ж кольору (25%) — що контрастніше. */
function inkFor(c: AccentColor): { css: string; hex: string } {
  const dark = mixHex(c.hex, BLACK, 0.25);
  return contrast(WHITE, c.hex) >= contrast(dark, c.hex) ? { css: "var(--cb-white)", hex: WHITE } : { css: mixCss(c.css, 25, "black"), hex: dark };
}
/** Найсвітліший темний відтінок того ж кольору, що дає 4.5:1 на фоні bgHex. */
function deepOn(c: AccentColor, bgHex: string): { css: string; hex: string } {
  for (let p = 75; p >= 0; p -= 5) {
    const hex = mixHex(c.hex, BLACK, p / 100);
    if (contrast(hex, bgHex) >= 4.5) return { css: p === 0 ? "var(--cb-black)" : mixCss(c.css, p, "black"), hex };
  }
  return { css: "var(--cb-black)", hex: BLACK };
}


/* ---- стилі й елементи ---- */
export type AccentStyle = "fill" | "tint" | "outline" | "gradient" | "flat" | "glass";
export const STYLE_LABEL: Record<AccentStyle, string> = { fill: "Заливка", tint: "Тон", outline: "Контур", gradient: "Градієнт", flat: "Плоска", glass: "Напівпрозора" };
/** Що робить вигляд з кольором — однаково в конструкторі й на /admin/design. */
export const STYLE_DESC: Record<AccentStyle, string> = {
  fill: "Суцільний колір, текст білий або темний — найпомітніше.",
  tint: "Блідий фон того ж кольору й темний текст — спокійно. Колір здається світлішим, але він той самий.",
  outline: "Білий фон і кольорова рамка — найлегше.",
  gradient: "Колір переходить у темніший — об’єм, як у медалі.",
  flat: "Рівна заливка без переходу.",
  glass: "Колір просвічує крізь зелену картку.",
};

/** Групи елементів — як у переліку на /admin/design. */
export const ACCENT_GROUPS = [
  { key: "main", label: "Великі елементи" },
  { key: "progress", label: "Прогрес" },
  { key: "nav", label: "Навігація і кнопки" },
  { key: "labels", label: "Мітки і цифри" },
  { key: "status", label: "Статуси" },
] as const;
export type AccentGroupKey = (typeof ACCENT_GROUPS)[number]["key"];

/** Вибір «Як зараз» — точний колишній вигляд елемента (Malty), коли його немає в палітрі. */
export const NOW_ID = "now";
export const NOW_LABEL = "Як зараз (Malty)";

/**
 * Додаткові токени елемента: ico — колір значка (= текст), on — текст на
 * суцільному кольорі (сегменти, клітинки), text — колір як текст на білому.
 */
type Extra = "ico" | "on" | "text";
type ElementDef = {
  id: string;
  label: string;
  group: AccentGroupKey;
  /** Де в застосунку — показується в конструкторі під назвою. */
  hint: string;
  styles: AccentStyle[];
  /** Частка кольору в «Тоні» (решта — білий). */
  tint?: number;
  /** Рамка у заливці/тоні (у аватара — напівпрозоре біле кільце, як було;
   *  "color" — завжди рамка кольором елемента, як у сертифіката). */
  restBorder?: string;
  extra?: Extra[];
  /** Токени «Як зараз» (ключ — суфікс: "" | bg | fg | bd | ico | on | text). */
  now?: Record<string, string>;
  pick: { color: string; style: AccentStyle | null };
};
const okText = (c: string, w: string) => `color-mix(in srgb, var(--cb-${c}) ${w}, var(--cb-black))`;
/**
 * Дефолти `pick`: великі елементи — фінальний вибір користувача в
 * конструкторі (2026-10-04); решта — «Як зараз» або колір палітри, що
 * збігається з тим, що було (нічого не міняється, доки не оберуть).
 */
export const ACCENT_ELEMENTS = [
  // Великі елементи
  { id: "avatar", group: "main", label: "Аватари-ініціали", hint: "команда, лідери, «Потребують уваги», картка без фото", styles: ["fill", "tint", "outline"], restBorder: "var(--cb-white-overlay-50)", pick: { color: "green-deep", style: "fill" } },
  { id: "badge", group: "main", label: "Кружки нагород", hint: "«Досягнення» → Відзнаки", styles: ["gradient", "flat", "tint"], pick: { color: "green-light", style: "tint" } },
  { id: "course", group: "main", label: "Іконки курсів", hint: "квадрат на картці курсу", styles: ["fill", "tint", "outline"], pick: { color: "green-deep", style: "tint" } },
  { id: "ring", group: "main", label: "Кільце фото", hint: "обвідка аватара на зеленій картці", styles: [], pick: { color: "brand-green", style: null } },
  { id: "level", group: "main", label: "Зірка рівня", hint: "зелена картка й «Мій прогрес»", styles: ["fill", "tint"], pick: { color: "teal-light", style: "tint" } },
  { id: "cert", group: "main", label: "Сертифікати", hint: "«Досягнення» і фінальний екран курсу", styles: ["tint", "outline"], tint: 22, restBorder: "color", pick: { color: "gold-light", style: "outline" } },
  { id: "quiz", group: "main", label: "Іконка банера тесту", hint: "кружок «Перевірте себе» в плеєрі", styles: ["fill", "tint", "outline"], pick: { color: "gold-main", style: "fill" } },
  { id: "settings", group: "main", label: "Іконки налаштувань", hint: "квадрати в шестерні й налаштуваннях сповіщень", styles: ["tint", "fill", "outline"], tint: 12, pick: { color: "green-main", style: "tint" } },
  // Прогрес
  { id: "bar-course", group: "progress", label: "Смуга на картці курсу", hint: "«Курси»: скільки модулів складено", styles: [], pick: { color: "brand-green", style: null } },
  { id: "bar-xp", group: "progress", label: "Смуга рівня", hint: "«Мій прогрес»: бали до наступного рівня", styles: [], pick: { color: "brand-green", style: null } },
  { id: "bar-player", group: "progress", label: "Смуга в плеєрі", hint: "плеєр курсу: пройдені екрани", styles: [], pick: { color: "brand-green", style: null } },
  { id: "bar-chart", group: "progress", label: "Стовпчики діаграм", hint: "кабінет керівника: дедлайни, бали, курси, тижні", styles: [], pick: { color: "brand-green", style: null } },
  { id: "plan-line", group: "progress", label: "Лінія плану курсу", hint: "план курсу: пройдений шлях між модулями", styles: [], pick: { color: "green-main", style: null } },
  { id: "ring-chart", group: "progress", label: "Кільце «З першої спроби»", hint: "кабінет керівника; інші кільця фарбуються за результатом (червоний → зелений)", styles: [], pick: { color: "green-main", style: null } },
  // Навігація і кнопки
  { id: "tabbar", group: "nav", label: "Капсула нижнього меню", hint: "телефон: активний розділ унизу екрана", styles: ["fill", "tint"], pick: { color: "brand-green", style: "fill" } },
  {
    id: "sidenav", group: "nav", label: "Рамка бокового меню", hint: "кабінет керівника на комп’ютері: активний розділ ліворуч", styles: ["outline", "tint", "fill"], extra: ["ico"],
    now: { "": "var(--cb-secondary)", bg: "var(--surface)", fg: "var(--green-700)", bd: "var(--green-500)", ico: "var(--p-accent-text)" },
    pick: { color: NOW_ID, style: null },
  },
  { id: "btn", group: "nav", label: "Головні кнопки", hint: "«Почати курс», «Далі», «Надіслати», «Завантажити PDF»", styles: ["fill", "gradient"], pick: { color: "brand-green", style: "fill" } },
  {
    id: "btn2", group: "nav", label: "Другорядні кнопки", hint: "контурні кнопки в налаштуваннях і сповіщеннях", styles: ["outline", "tint"],
    now: { "": "var(--cb-primary)", bg: "transparent", fg: "var(--cb-primary)", bd: "var(--cb-primary)" },
    pick: { color: NOW_ID, style: null },
  },
  // Мітки і цифри
  {
    id: "tag-new", group: "labels", label: "Мітка «Новий»", hint: "картка щойно призначеного курсу", styles: ["tint", "fill", "outline"],
    now: { "": "var(--cb-secondary)", bg: "var(--cb-secondary-tint)", fg: "var(--p-accent-text)", bd: "transparent" },
    pick: { color: NOW_ID, style: null },
  },
  { id: "nav-dot", group: "labels", label: "Крапка «нове» в меню", hint: "телефон: на іконці «Курси», коли є нові", styles: [], now: { "": "var(--danger)" }, pick: { color: NOW_ID, style: null } },
  {
    id: "points-chip", group: "labels", label: "Плашка «+N балів»", hint: "фінальний екран курсу", styles: ["gradient", "fill", "tint"],
    now: { "": "var(--cb-tertiary)", bg: "linear-gradient(135deg, var(--gold), color-mix(in srgb, var(--cb-tertiary) 78%, var(--cb-black)))", fg: okText("tertiary", "25%"), bd: "transparent" },
    pick: { color: NOW_ID, style: null },
  },
  {
    id: "bell", group: "labels", label: "Лічильник дзвоника", hint: "кількість непрочитаних сповіщень", styles: ["fill"],
    now: { "": "var(--p-fail-solid)", bg: "var(--p-fail-solid)", fg: "var(--cb-white)", bd: "transparent" },
    pick: { color: NOW_ID, style: null },
  },
  { id: "unread", group: "labels", label: "Непрочитане сповіщення", hint: "рамка й фон у центрі сповіщень", styles: ["tint", "outline"], tint: 12, restBorder: "color", pick: { color: "green-main", style: "tint" } },
  { id: "score", group: "labels", label: "Цифри балів і місця", hint: "бали, «№ 1», бали лідерів і відзнак, назви посад у лідерах", styles: [], pick: { color: "brand-green", style: null } },
  {
    id: "lb-self", group: "labels", label: "Мій рядок у лідерах", hint: "«Досягнення»: рядок «я» в рейтингу", styles: ["tint", "outline"], tint: 8, restBorder: "color",
    now: { "": "var(--green-700)", bg: "color-mix(in srgb, var(--green-700) 8%, var(--surface-1))", fg: "var(--ink)", bd: "var(--green-700)" },
    pick: { color: NOW_ID, style: null },
  },
  {
    id: "hero-stats", group: "labels", label: "Плашки на зеленій картці", hint: "кабінет керівника: «Бали / Рейтинг / Нагороди»", styles: ["glass"],
    now: { "": "var(--cb-white)", bg: "var(--cb-white-overlay-10)", fg: "var(--cb-white)", bd: "transparent" },
    pick: { color: NOW_ID, style: null },
  },
  // Статуси: один колір = пілюля (тон), сегмент «Стан команди», клітинка матриці, точка плану.
  {
    id: "st-success", group: "status", label: "Успіх: «Складено», «Вчасно»", hint: "пілюлі, сегмент «Вчасно», клітинка «Складено», пройдений модуль у плані", styles: ["tint"], tint: 22, extra: ["on", "text"],
    now: { "": "var(--cb-success)", bg: "var(--cb-success-light)", fg: okText("success", "45%"), bd: "transparent", on: "var(--ink)", text: okText("success", "45%") },
    pick: { color: NOW_ID, style: null },
  },
  {
    id: "st-fail", group: "status", label: "Тривога: «Прострочено», «Не складено»", hint: "пілюлі, сегмент і клітинка «Прострочено», дата на картці курсу", styles: ["tint"], tint: 22, extra: ["on", "text"],
    now: { "": "var(--p-fail-solid)", bg: "var(--cb-fail-light)", fg: okText("fail", "45%"), bd: "transparent", on: "var(--cb-white)", text: "var(--p-danger-text)" },
    pick: { color: NOW_ID, style: null },
  },
  {
    id: "st-alert", group: "status", label: "Увага: «Відстає», «Перескласти»", hint: "пілюлі, сегмент і клітинка «Відстає», модуль на повтор у плані", styles: ["tint"], tint: 22, extra: ["on", "text"],
    now: { "": "var(--cb-alert)", bg: "var(--cb-alert-light)", fg: "var(--p-alert-pill-text)", bd: "transparent", on: "var(--ink)", text: "var(--p-alert-pill-text)" },
    pick: { color: NOW_ID, style: null },
  },
  {
    id: "st-info", group: "status", label: "В процесі: «В роботі», «Доступно»", hint: "клітинка «В процесі», доступний модуль у плані", styles: ["tint"], tint: 22, extra: ["on", "text"],
    now: { "": "var(--p-info-solid)", bg: "var(--cb-notification-light)", fg: okText("notification", "45%"), bd: "transparent", on: "var(--cb-white)", text: okText("notification", "45%") },
    pick: { color: NOW_ID, style: null },
  },
] as const satisfies readonly ElementDef[];
export type AccentElement = (typeof ACCENT_ELEMENTS)[number]["id"];
const elOf = (id: string) => ACCENT_ELEMENTS.find((e) => e.id === id) as ElementDef;
export const accentElement = (id: string) => elOf(id);
export const ACCENT_TOKEN_PREFIX = "accent-";

/** Значення токенів для кольору (id палітри або NOW_ID) і вигляду елемента. */
export function accentTokenValues(id: AccentElement, colorId: string, style: AccentStyle | null): TokenValues {
  const el = elOf(id);
  const k = `${ACCENT_TOKEN_PREFIX}${id}`;
  if (colorId === NOW_ID && el.now) return Object.fromEntries(Object.entries(el.now).map(([s, v]) => [s ? `${k}-${s}` : k, v]));
  const c = colorById(colorId) ?? colorById(el.pick.color) ?? colorById("brand-green")!;
  if (!el.styles.length) return { [k]: c.css };
  const s = style && el.styles.includes(style) ? style : el.styles[0];
  const rest = el.restBorder === "color" ? c.css : (el.restBorder ?? "transparent");
  const ratio = el.tint ?? 20;
  let bg: string, fg: string, bd: string;
  if (s === "tint") {
    const bgHex = mixHex(c.hex, WHITE, ratio / 100);
    bg = mixCss(c.css, ratio, "white");
    fg = deepOn(c, bgHex).css;
    bd = rest;
  } else if (s === "outline") {
    bg = "var(--cb-white)";
    fg = deepOn(c, WHITE).css;
    bd = c.css;
  } else if (s === "gradient") {
    bg = `linear-gradient(150deg, ${c.css}, ${mixCss(c.css, 78, "black")})`;
    fg = inkFor(c).css;
    bd = rest;
  } else if (s === "glass") {
    bg = `color-mix(in srgb, ${c.css} 30%, transparent)`;
    fg = "var(--cb-white)";
    bd = "transparent";
  } else {
    bg = c.css;
    fg = inkFor(c).css;
    bd = rest;
  }
  const out: TokenValues = { [k]: c.css, [`${k}-bg`]: bg, [`${k}-fg`]: fg, [`${k}-bd`]: bd };
  for (const x of el.extra ?? []) out[`${k}-${x}`] = x === "ico" ? fg : x === "on" ? inkFor(c).css : deepOn(c, WHITE).css;
  return out;
}

/** Колір видимої поверхні елемента (hex) — для підказки «губиться на темно-зеленій картці». */
export function surfaceHex(id: AccentElement, colorId: string, style: AccentStyle | null): string {
  const el = elOf(id);
  const c = colorById(colorId) ?? colorById(el.pick.color) ?? colorById("brand-green")!;
  if (style === "tint") return mixHex(c.hex, WHITE, (el.tint ?? 20) / 100);
  if (style === "outline") return WHITE;
  return c.hex;
}

/** Що зараз обрано для елемента; null — значення не з палітри (чуже/зламане). */
export function readAccent(id: AccentElement, values: TokenValues): { color: string; style: AccentStyle | null } | null {
  const el = elOf(id);
  const match = (tokens: TokenValues) => Object.entries(tokens).every(([key, v]) => values[key] === v);
  if (el.now && match(accentTokenValues(id, NOW_ID, null))) return { color: NOW_ID, style: null };
  const styles: (AccentStyle | null)[] = el.styles.length ? el.styles : [null];
  for (const c of ACCENT_COLORS) {
    for (const s of styles) if (match(accentTokenValues(id, c.id, s))) return { color: c.id, style: s };
  }
  return null;
}

/** «Усі однаково» — один колір на всі ВЕЛИКІ елементи (правило гайду «лише один вторинний»), вигляд лишається. */
export function allAccentValues(colorId: string, values: TokenValues): TokenValues {
  return Object.assign(
    {},
    ...ACCENT_ELEMENTS.filter((e) => e.group === "main" && e.id !== "settings").map((e) => accentTokenValues(e.id, colorId, readAccent(e.id, values)?.style ?? e.pick.style))
  );
}

/** Токени групи для whitelist /admin/design: усі допустимі значення, дефолт — pick. */
export function accentTokenDefs(group: string): ChoiceDef[] {
  const out: ChoiceDef[] = [];
  for (const e of ACCENT_ELEMENTS) {
    const el = e as ElementDef;
    const def = accentTokenValues(e.id, el.pick.color, el.pick.style);
    const all = new Map<string, Set<string>>();
    const put = (tokens: TokenValues) => {
      for (const [k, v] of Object.entries(tokens)) (all.get(k) ?? all.set(k, new Set()).get(k)!).add(v);
    };
    if (el.now) put(accentTokenValues(e.id, NOW_ID, null));
    const styles: (AccentStyle | null)[] = el.styles.length ? el.styles : [null];
    for (const c of ACCENT_COLORS) for (const s of styles) put(accentTokenValues(e.id, c.id, s));
    for (const [key, vals] of all) out.push({ key, label: `${el.label}: ${key}`, group, kind: "choice", choices: [...vals].map((v) => ({ label: v, value: v })), def: def[key] });
  }
  return out;
}

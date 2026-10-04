/**
 * Підказки до кольорів великих елементів (2026-10-04, /admin/design і
 * конструктор CarLS Accents). Лише ПІДКАЗКИ — обрати можна будь-що (рішення
 * користувача). Палітра — lib/accentPalette.ts: сім вторинних кольорів
 * Carlsberg Group design guide у трьох відтінках + Carlsberg green і сірі
 * Malty. Правила — з гайду й загальних UI-практик:
 *  - гайд: у макеті основні кольори + ЛИШЕ ОДИН вторинний; користувач
 *    дозволив до двох на екрані. Відтінки одного кольору — один акцент;
 *    Carlsberg green і сірі — не вторинні, не рахуються;
 *  - кольори, схожі на статуси (зелений ≈ «Складено», жовтий ≈ «Відстає»,
 *    бордовий і лососевий ≈ червоним «Прострочено»/«Не складено»), — краще
 *    там, де статусів поруч немає: інакше прикраса читається як стан;
 *  - на темно-зеленій картці профілю видима поверхня елемента має
 *    відрізнятися від картки (контраст ≥ 3:1), інакше він губиться.
 * Іконки налаштувань (окрема шторка) у правило «два на екрані» не входять.
 */
import { HERO_HEX, colorById, contrast, surfaceHex, type AccentElement, type AccentFamily, type AccentStyle } from "@/lib/accentPalette";

export type AccentChoice = { color: string; style: AccentStyle | null };
export type AccentPick = Partial<Record<string, AccentChoice | null>>;

/** Які елементи видно разом — для правила «не більше двох вторинних на екрані». */
export const ACCENT_SCREENS: { name: string; elements: string[] }[] = [
  { name: "Головна хабу", elements: ["ring", "level", "course"] },
  { name: "Команда (кабінет керівника)", elements: ["ring", "level", "avatar"] },
  { name: "Досягнення", elements: ["level", "badge", "cert", "avatar"] },
  { name: "Профіль", elements: ["ring", "level", "avatar"] },
  { name: "Плеєр курсу", elements: ["quiz", "cert"] },
];
/** Елементи, поруч із якими стоять статуси (пілюлі, трофей «Складено»). */
const NEAR_STATUS = new Set(["avatar", "course", "quiz", "cert"]);
const STATUS_LIKE: Partial<Record<AccentFamily, string>> = {
  green: "«Складено»",
  yellow: "«Відстає»",
  burgundy: "«Прострочено»",
  salmon: "«Не складено»",
};
/** Елементи на темно-зеленій картці профілю. */
const ON_HERO = new Set(["ring", "level"]);
/** Не вторинні кольори гайду — у ліміт акцентів на екрані не входять. */
const NEUTRAL = new Set<AccentFamily>(["brand", "grey"]);
export const MAX_PER_SCREEN = 2;
const CROWD = "Понад два";

const famOf = (c: AccentChoice | null | undefined) => (c ? colorById(c.color)?.fam : undefined);
const STATUS_IDS = ["st-success", "st-fail", "st-alert", "st-info"];
const statusName = (id: string) => ({ "st-success": "Успіх", "st-fail": "Тривога", "st-alert": "Увага", "st-info": "В процесі" })[id] ?? id;

/** Підказки для кожного елемента; немає ключа — усе гаразд. */
export function accentAdvice(pick: AccentPick): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (id: string, msg: string) => (out[id] ??= []).push(msg);
  for (const [id, choice] of Object.entries(pick)) {
    const fam = famOf(choice);
    if (!choice || !fam) continue;
    if (NEAR_STATUS.has(id) && STATUS_LIKE[fam]) add(id, `Схожий на статус ${STATUS_LIKE[fam]} поруч — прикраса може читатись як стан.`);
    if (ON_HERO.has(id)) {
      const r = contrast(surfaceHex(id as AccentElement, choice.color, choice.style), HERO_HEX);
      if (r < 3) add(id, `Губиться на темно-зеленій картці (контраст ${r.toFixed(1)}:1) — світліший відтінок або «Тон» буде помітніший.`);
    }
  }
  // Один рядок на елемент, а не по рядку на кожен екран із перебором.
  const crowded: Record<string, string[]> = {};
  for (const s of ACCENT_SCREENS) {
    const fams = new Set(s.elements.map((id) => famOf(pick[id])).filter((f): f is AccentFamily => !!f && !NEUTRAL.has(f)));
    if (fams.size > MAX_PER_SCREEN) for (const id of s.elements) if (pick[id]) (crowded[id] ??= []).push(`«${s.name}»`);
  }
  for (const [id, screens] of Object.entries(crowded)) add(id, `${CROWD} вторинні кольори разом на: ${screens.join(", ")} — гайд радить один, максимум два (відтінки одного кольору — один).`);
  // Статуси стоять поруч (смуга «Стан команди», матриця) — однакове сімейство
  // кольору робить два стани нерозрізненними.
  for (const a of STATUS_IDS) {
    const fa = famOf(pick[a]);
    if (!fa) continue;
    const twins = STATUS_IDS.filter((b) => b !== a && famOf(pick[b]) === fa);
    if (twins.length) add(a, `Той самий колір, що в «${twins.map(statusName).join("», «")}» — стани буде не розрізнити.`);
  }
  return out;
}

/** Як колір сприймається (коротко, для підказок). */
export const ACCENT_MEANING: Record<AccentFamily, string> = {
  gold: "престиж, нагорода, спадщина Carlsberg",
  teal: "свіжість, спокій, сучасність",
  blue: "довіра, знання, робота; найконтрастніший",
  green: "сам бренд Carlsberg, успіх",
  yellow: "енергія, увага",
  burgundy: "глибина, преміальність, темний",
  salmon: "тепло, м’якість, свято",
  brand: "фірмовий Carlsberg green — солідно, без зайвого акценту",
  grey: "нейтрально, не відволікає",
};

/** Що пасує кожному елементу за змістом (best — сімейства кольорів) і як його показати. */
export const ACCENT_GUIDE: Record<string, { how: string; best: AccentFamily[] }> = {
  avatar: { how: "Дві літери в кружку. Людей у списках багато й поруч статуси — спокійний колір, що не читається як стан; «Тон» — найделікатніше.", best: ["blue", "teal", "gold", "grey"] },
  badge: { how: "Медаль за досягнення — теплі «святкові» кольори; градієнт додає об’єму. Неотримані лишаються сірими.", best: ["gold", "salmon", "green", "yellow"] },
  course: { how: "Квадрат-іконка на картці курсу — робочий елемент поруч зі статусами. Спокійний колір знань.", best: ["blue", "teal", "gold", "brand"] },
  ring: { how: "Обвідка фото на темно-зеленій картці — має світитися: світлі й основні відтінки.", best: ["gold", "teal", "salmon", "green", "yellow"] },
  level: { how: "Маленька зірка рангу — «золота зірка». На темно-зеленій картці — світлі кольори або «Тон».", best: ["gold", "yellow", "teal"] },
  cert: { how: "Документ про досягнення: рамка, підкладка, значок. Класика — золото; синій — «офіційно».", best: ["gold", "blue", "brand"] },
  quiz: { how: "Кружок, що пульсує, кличе до тесту — помітно, але не тривожно.", best: ["teal", "blue", "gold"] },
  settings: { how: "Дрібні службові іконки в шторці — не мають відволікати; тон або контур.", best: ["teal", "blue", "grey", "brand", "green"] },
  "bar-course": { how: "Тонка смуга «скільки пройдено» — спокійний колір бренду; не зелений «Складено», щоб незавершене не читалось як готове.", best: ["brand", "teal", "blue"] },
  "bar-xp": { how: "Шлях до наступного рівня — можна теплішим, у тон зірці рівня.", best: ["brand", "gold", "teal"] },
  "bar-player": { how: "Прогрес у плеєрі — нейтрально, не відволікає від змісту курсу.", best: ["brand", "teal", "blue"] },
  "bar-chart": { how: "Стовпчики діаграм керівника — один спокійний колір; червоним лишаються лише «погані» значення.", best: ["brand", "blue", "teal"] },
  "plan-line": { how: "Пройдений шлях по плану — зелений природно читається як «пройдено».", best: ["green", "brand", "teal"] },
  "ring-chart": { how: "Кільце без оцінки «добре/погано» — колір бренду.", best: ["green", "brand", "teal", "blue"] },
  tabbar: { how: "Капсула активного розділу — найпомітніше на телефоні; фірмовий зелений тримає застосунок упізнаваним.", best: ["brand", "green", "teal"] },
  sidenav: { how: "Рамка активного пункту меню — тонко, контуром.", best: ["green", "brand", "teal"] },
  btn: { how: "Головна дія на екрані — одна кнопка, найконтрастніша. Фірмовий зелений — стандарт Carlsberg.", best: ["brand", "green"] },
  btn2: { how: "Другорядна дія — контур тієї ж гами, що й головна кнопка.", best: ["brand", "green", "grey"] },
  "tag-new": { how: "Мітка «новий» — свіже, але не тривожне.", best: ["green", "teal", "blue"] },
  "nav-dot": { how: "Маленька крапка «є нове» — має бути помітною; червоний або жовтий.", best: ["salmon", "yellow", "burgundy"] },
  "points-chip": { how: "Нагорода за курс — святкові теплі кольори, градієнт.", best: ["gold", "yellow", "salmon"] },
  bell: { how: "Лічильник непрочитаних — помітний, контрастний.", best: ["salmon", "burgundy", "blue"] },
  unread: { how: "Нове сповіщення — ледь тонований фон і рамка.", best: ["green", "teal", "blue"] },
  score: { how: "Цифри балів і місця — темні, добре читаються на білому.", best: ["brand", "blue", "grey"] },
  "lb-self": { how: "Свій рядок у рейтингу — виділений, але спокійно.", best: ["brand", "green", "teal", "gold"] },
  "hero-stats": { how: "Плашки на темно-зеленій картці — напівпрозоро, щоб не сперечатися з карткою.", best: ["grey", "teal", "gold"] },
  "st-success": { how: "Успіх — зелений: так його читають усі. Інший колір — лише свідомо.", best: ["green"] },
  "st-fail": { how: "Тривога — червоні відтінки (бордовий, лососевий). Значки ✓ ! ⏱ у «Сприйнятті» допоможуть дальтонікам.", best: ["burgundy", "salmon"] },
  "st-alert": { how: "Увага — жовтий або золото: «є що доробити», не «біда».", best: ["yellow", "gold"] },
  "st-info": { how: "В процесі — синій або бірюзовий: нейтральний «у роботі».", best: ["blue", "teal"] },
};

export type AccentVerdict = { level: "best" | "ok" | "bad"; reasons: string[] };

/**
 * Оцінка кольору для елемента з урахуванням інших: bad — є підказка (статус
 * поруч, губиться на картці, третій акцент на екрані); best — пасує за
 * змістом; ok — можна.
 */
export function accentVerdict(id: string, choice: AccentChoice, pick: AccentPick): AccentVerdict {
  // Перебір кольорів на екрані, який є й без цього елемента, — не провина
  // цієї плитки: інакше ⚠ стояв би на ВСІХ кольорах і нічого не підказував.
  const crowdedAnyway = Object.values(accentAdvice({ ...pick, [id]: null })).some((list) => list.some((m) => m.startsWith(CROWD)));
  const problems = (accentAdvice({ ...pick, [id]: choice })[id] ?? []).filter((m) => !(crowdedAnyway && m.startsWith(CROWD)));
  if (problems.length) return { level: "bad", reasons: problems };
  const fam = colorById(choice.color)?.fam;
  if (!fam) return { level: "ok", reasons: [] };
  return { level: ACCENT_GUIDE[id]?.best.includes(fam) ? "best" : "ok", reasons: [ACCENT_MEANING[fam]] };
}

/** Готові поєднання КОЛЬОРІВ (вигляд кожного елемента лишається). Іконки налаштувань не чіпають. */
export const ACCENT_PRESETS: { key: string; label: string; why: string; colors: Record<string, string> }[] = [
  {
    key: "gold",
    label: "Класика: золото",
    why: "Строго за гайдом — один вторинний. Золото — спадщина Carlsberg, не сперечається з жодним статусом.",
    colors: { avatar: "gold-main", badge: "gold-main", course: "gold-main", ring: "gold-light", level: "gold-main", cert: "gold-main", quiz: "gold-main" },
  },
  {
    key: "teal",
    label: "Відтінки бірюзи",
    why: "Один вторинний у трьох відтінках — сучасно й легко. Світла бірюза добре видна на темно-зеленій картці.",
    colors: { avatar: "teal-deep", badge: "teal-main", course: "teal-main", ring: "teal-light", level: "teal-light", cert: "teal-deep", quiz: "teal-main" },
  },
  {
    key: "gold-blue",
    label: "Золото + синій",
    why: "Золото — нагороди й рівень, синій — люди, курси, тести. Чіткий поділ «досягнення / робота».",
    colors: { avatar: "blue-main", badge: "gold-main", course: "blue-deep", ring: "gold-light", level: "gold-main", cert: "gold-main", quiz: "blue-main" },
  },
  {
    key: "gold-teal",
    label: "Золото + бірюза",
    why: "Той самий поділ, але м’якше: бірюза близька за насиченістю до золота.",
    colors: { avatar: "teal-main", badge: "gold-main", course: "teal-main", ring: "gold-light", level: "gold-main", cert: "gold-main", quiz: "teal-main" },
  },
  {
    key: "brand",
    label: "Фірмова пара",
    why: "Зелений Carlsberg на робочих елементах, золото — на нагородах і зірці. Зелений гайду — лише там, де немає статусів.",
    colors: { avatar: "brand-green", badge: "green-main", course: "brand-green", ring: "green-light", level: "gold-main", cert: "gold-main", quiz: "gold-main" },
  },
];
